# SPDX-License-Identifier: GPL-3.0-or-later
import json
import os
import queue
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from .paths import APP_CACHE, APP_CONFIG
from .ui import CliError

MAX_OUTPUT = 512 * 1024
MAX_RESULTS = 50
HARNESS = Path(__file__).resolve().parent / "harness.js"
HARNESS_MARKER = "QRYG_SEARCH_HARNESS "
EFFECT_KEYS = ("copy", "open", "exec", "terminal", "notify")


def coerce(definition, value):
    kind, default = definition["type"], definition.get("default")
    if kind == "bool":
        return value if isinstance(value, bool) else bool(default)
    if kind == "int":
        low, high = definition.get("min"), definition.get("max")
        valid = isinstance(value, int) and not isinstance(value, bool)
        valid = valid and (low is None or value >= low) and (high is None or value <= high)
        return value if valid else (0 if default is None else default)
    if kind == "strings":
        return [str(v) for v in value] if isinstance(value, list) else (default or [])
    if kind == "choice":
        choices = definition.get("choices") or []
        return value if value in choices else (default if default is not None else (choices[0] if choices else ""))
    return value if isinstance(value, str) else (default or "")


def resolve_settings(manifest, read=None):
    values = {}
    for definition in manifest["settings"]:
        stored = read(definition) if read else None
        values[definition["key"]] = stored if definition.get("gsetting") and read else coerce(definition, stored)
    return values


def has_effects(value):
    return isinstance(value, dict) and any(value.get(k) is not None for k in EFFECT_KEYS)


def plugin_env(manifest):
    cache = APP_CACHE / "plugins" / manifest["id"]
    config = APP_CONFIG / "plugins" / manifest["id"]
    cache.mkdir(parents=True, exist_ok=True)
    config.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.update({
        "QRYG_SEARCH_PLUGIN_ID": manifest["id"], "QRYG_SEARCH_PLUGIN_DIR": manifest["dir"],
        "QRYG_SEARCH_CACHE_DIR": str(cache), "QRYG_SEARCH_CONFIG_DIR": str(config),
    })
    return env


def command_for(manifest):
    command = manifest.get("command")
    if isinstance(command, list) and command:
        return [str(part) for part in command]
    return [os.path.join(manifest["dir"], manifest["main"])]


def decode(text):
    text = text.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError as error:
        raise CliError(f"invalid JSON on stdout: {text[:120]}") from error


def results_of(data):
    items = data if isinstance(data, list) else data.get("results", []) if isinstance(data, dict) else []
    if not isinstance(items, list):
        return []
    return [r for r in items[:MAX_RESULTS] if isinstance(r, dict) and isinstance(r.get("title"), str) and r["title"]]


class Run:
    def __init__(self):
        self.results = []
        self.ms = 0
        self.activation = None
        self.logs = []
        self.stderr = ""


def exit_error(returncode, stderr):
    """Mirrors exitError() in lib/plugins/script.js."""
    reason = f"exit {returncode}" if returncode > 0 else f"killed by signal {-returncode}"
    lines = stderr.strip().splitlines()
    return f"{reason}: {lines[-1]}" if lines else reason


class OneShot:
    def __init__(self, manifest):
        self._manifest = manifest
        self.logs = []
        self.stderr = ""

    def request(self, method, payload):
        timeout = self._manifest["timeout"]
        line = json.dumps({"method": method, **payload}) + "\n"
        try:
            proc = subprocess.run(command_for(self._manifest) + [method], input=line.encode(), capture_output=True,
                                  cwd=self._manifest["dir"], env=plugin_env(self._manifest), timeout=timeout / 1000)
        except subprocess.TimeoutExpired as error:
            raise CliError(f"timed out after {timeout} ms") from error
        stderr = proc.stderr.decode(errors="replace")
        self.stderr += stderr
        if proc.returncode != 0:
            raise CliError(exit_error(proc.returncode, stderr))
        if len(proc.stdout) > MAX_OUTPUT:
            raise CliError(f"output larger than {MAX_OUTPUT // 1024} KB")
        return decode(proc.stdout.decode(errors="replace"))

    def close(self):
        pass


class Server:
    def __init__(self, manifest):
        self._manifest = manifest
        self._proc = subprocess.Popen(command_for(manifest) + ["serve"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, cwd=manifest["dir"], env=plugin_env(manifest))
        self._lines = queue.Queue()
        self._errors = []
        self._next_id = 1
        self.ready = False
        self.logs = []
        self._readers = [threading.Thread(target=self._read, args=(self._proc.stdout, self._lines.put), daemon=True),
                         threading.Thread(target=self._read, args=(self._proc.stderr, self._errors.append), daemon=True)]
        for reader in self._readers:
            reader.start()

    @property
    def stderr(self):
        return "".join(line.decode(errors="replace") for line in self._errors if line)

    @staticmethod
    def _read(stream, put):
        for line in iter(stream.readline, b""):
            put(line)
        put(None)

    def request(self, method, payload):
        timeout = self._manifest["timeout"] + (0 if self.ready else self._manifest["startupTimeout"])
        request_id = self._next_id
        self._next_id += 1
        try:
            self._proc.stdin.write((json.dumps({"id": request_id, "method": method, **payload}) + "\n").encode())
            self._proc.stdin.flush()
        except BrokenPipeError as error:
            raise CliError("the plugin process exited") from error
        deadline = time.monotonic() + timeout / 1000
        while True:
            try:
                line = self._lines.get(timeout=max(0, deadline - time.monotonic()))
            except queue.Empty as error:
                raise CliError(f"timed out after {timeout} ms") from error
            if line is None:
                raise CliError("the plugin process exited")
            if len(line) > MAX_OUTPUT:
                raise CliError(f"a reply was larger than {MAX_OUTPUT // 1024} KB")
            if not line.strip():
                continue
            self.ready = True
            try:
                message = json.loads(line)
            except ValueError:
                self.logs.append(f"invalid JSON line: {line.decode(errors='replace')[:120]}")
                continue
            if not isinstance(message, dict):
                continue
            if message.get("method") in ("log", "error", "refresh"):
                self.logs.append(f"{message['method']}: {message.get('message', '')}".rstrip(": "))
            elif message.get("id") == request_id:
                return message

    def close(self):
        self._proc.stdin.close()
        self._proc.terminate()
        try:
            self._proc.wait(timeout=1)
        except subprocess.TimeoutExpired:
            self._proc.kill()
            self._proc.wait()
        for reader in self._readers:
            reader.join(timeout=1)
        self._proc.stdout.close()
        self._proc.stderr.close()


def run_script(manifest, query, settings, activate=None, raw=None):
    channel = Server(manifest) if manifest["persistent"] else OneShot(manifest)
    run = Run()
    try:
        payload = {"query": query, "raw": query if raw is None else raw, "forced": True, "filter": None, "settings": settings}
        started = time.monotonic()
        run.results = results_of(channel.request("query", payload))
        run.ms = round((time.monotonic() - started) * 1000)
        if activate is not None:
            run.activation = _activate(run.results, activate, lambda result: channel.request(
                "activate", {"result": result, "action": None, "settings": settings}))
    finally:
        channel.close()
        run.logs, run.stderr = channel.logs, channel.stderr
    return run


def _activate(results, number, call):
    if not 1 <= number <= len(results):
        raise CliError(f"--activate takes a result number from 1 to {len(results)}")
    result = results[number - 1]
    if isinstance(result.get("activate"), dict):
        return {"via": "the result's activate field", "effects": result["activate"]}
    effects = call(result)
    if isinstance(effects, dict):
        effects.pop("id", None)
    if has_effects(effects):
        return {"via": "the plugin's activate method", "effects": effects}
    fallback = result.get("copy") if result.get("copy") is not None else result.get("path")
    if fallback not in (None, ""):
        return {"via": "the copy fallback", "effects": {"copy": fallback}}
    return {"via": "nothing", "effects": {}}


def run_js(manifest, query, settings, activate=None, raw=None):
    gjs = shutil.which("gjs")
    if not gjs:
        raise CliError("testing JavaScript plugins needs gjs")
    config = {"manifest": manifest, "query": query, "raw": query if raw is None else raw, "settings": settings, "activate": activate}
    with tempfile.NamedTemporaryFile("w", suffix=".json") as request:
        json.dump(config, request)
        request.flush()
        try:
            proc = subprocess.run([gjs, "-m", str(HARNESS), request.name], capture_output=True,
                                  timeout=manifest["timeout"] / 1000 + 10)
        except subprocess.TimeoutExpired as error:
            raise CliError("the test harness did not finish") from error
    lines = proc.stdout.decode(errors="replace").splitlines()
    reply = next((line[len(HARNESS_MARKER):] for line in reversed(lines) if line.startswith(HARNESS_MARKER)), None)
    stderr = proc.stderr.decode(errors="replace")
    if reply is None:
        raise CliError(f"the test harness failed: {stderr.strip()[-400:] or 'no output'}")
    try:
        data = json.loads(reply)
    except ValueError as error:
        raise CliError(f"the test harness sent something that is not JSON: {error}") from error
    if data.get("error"):
        raise CliError(data["error"])
    run = Run()
    run.results, run.ms, run.activation = data["results"], data["ms"], data.get("activation")
    run.logs, run.stderr = data.get("logs", []), stderr
    return run
