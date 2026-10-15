# SPDX-License-Identifier: GPL-3.0-or-later
# Fetches a plugin from a folder, git repository, repository subfolder, archive or manifest URL.
# lib/plugins/remote.js and lib/plugins/installer.js do the same for the preferences window: keep them in step.
import json
import os
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from . import VERSION
from .ui import CliError

KINDS = ("folder", "git", "subdir", "archive", "manifest")
ARCHIVE_SUFFIXES = (".zip", ".tar.gz", ".tgz", ".tar.xz")
MAX_BYTES = 50 * 1024 * 1024
MAX_MANIFEST_BYTES = 1024 * 1024
TIMEOUT = 30
USER_AGENT = f"qryg-search/{VERSION} (+https://github.com/ru-dr/qryg-search)"
PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
URL = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
SCP = re.compile(r"^[\w.-]+@[\w.-]+:")
GIT_SCHEMES = ("http", "https", "ssh", "git", "file")
SUBDIR = re.compile(
    r"^(?P<repo>(?:https?|file)://[^/?#]*/[^/?#]+/[^?#]+?)(?:/-)?"
    r"/(?P<mode>tree|blob|src/(?:branch|tag|commit))/(?P<ref>[^/?#]+)(?P<path>/[^?#]*)?(?:[?#].*)?$")
TREE_STYLES = {"gitlab.com": "/-/tree/", "codeberg.org": "/src/branch/"}
IGNORED = {".git", "__MACOSX"}
RISKS = {
    "js": "JavaScript: runs inside GNOME Shell with full access to your session",
    "script": "Script: runs as your user, with your permissions",
}


def is_url(source):
    return bool(URL.match(source) or SCP.match(source))


def safe_relative(path, what="path"):
    if not isinstance(path, str) or not path or path.startswith("/") or "\\" in path:
        raise CliError(f"{what} {json.dumps(path)} must be a relative path inside the plugin")
    parts = [part for part in path.split("/") if part not in ("", ".")]
    if not parts or ".." in parts:
        raise CliError(f"{what} {json.dumps(path)} must be a relative path inside the plugin")
    return "/".join(parts)


def classify(source):
    spec = {"kind": None, "source": source, "repo": None, "ref": None, "subdir": ""}
    if not source:
        raise CliError("give a folder, git URL, archive URL or manifest URL")
    if not is_url(source):
        spec["kind"] = "archive" if source.lower().endswith(ARCHIVE_SUFFIXES) else "folder"
        return spec
    scheme = source.split(":", 1)[0].lower() if URL.match(source) else "ssh"
    path = urllib.parse.urlsplit(source).path if URL.match(source) else ""
    match = SUBDIR.match(source)
    if match:
        parts = [p for p in (match["path"] or "").split("/") if p not in ("", ".")]
        if parts and (match["mode"] == "blob" or parts[-1] == "manifest.json"):
            parts.pop()
        spec.update(kind="subdir", repo=match["repo"], ref=match["ref"],
                    subdir=safe_relative("/".join(parts), "folder") if parts else "")
    elif scheme in ("http", "https", "file") and path.lower().endswith(ARCHIVE_SUFFIXES):
        spec["kind"] = "archive"
    elif scheme in ("http", "https", "file") and path.rsplit("/", 1)[-1] == "manifest.json":
        spec["kind"] = "manifest"
    elif scheme in GIT_SCHEMES:
        spec.update(kind="git", repo=source)
    else:
        raise CliError(f"unsupported URL {source}; use https://, ssh://, git@ or a local folder")
    return spec


def subfolder_url(repo, path, ref="HEAD"):
    if not re.match(r"^(https?|file)://", repo):
        return None
    base = re.sub(r"\.git/?$", "", repo.rstrip("/"))
    style = TREE_STYLES.get(urllib.parse.urlsplit(base).hostname or "", "/tree/")
    return f"{base}{style}{ref}/{path}"


def manifest_files(manifest):
    files = manifest.get("files", [])
    if not isinstance(files, list):
        raise CliError('"files" must be a list of relative paths')
    wanted = [manifest["main"]] if isinstance(manifest.get("main"), str) else []
    result = []
    for path in wanted + files:
        clean = safe_relative(path, "file")
        if clean != "manifest.json" and clean not in result:
            result.append(clean)
    return result


def file_url(base, path):
    return urllib.parse.urljoin(base, urllib.parse.quote(path))


def problems(manifest, has_file, api_version):
    if not isinstance(manifest, dict):
        return ["manifest.json must be a JSON object"]
    found = []
    if not (isinstance(manifest.get("id"), str) and PLUGIN_ID.fullmatch(manifest["id"])):
        found.append("id must be lowercase letters, digits and dashes")
    if not isinstance(manifest.get("name"), str) or not manifest["name"].strip():
        found.append("name is required")
    kind, main, command = manifest.get("type"), manifest.get("main"), manifest.get("command")
    if kind not in ("js", "script"):
        found.append('type must be "js" or "script"')
    elif kind == "js" and not (isinstance(main, str) and main.endswith(".js")):
        found.append('js plugins need "main": "plugin.js"')
    elif kind == "js" and not has_file(main, False):
        found.append(f"{main} not found")
    elif kind == "script" and not (isinstance(command, list) and command):
        if not isinstance(main, str):
            found.append('script plugins need "main" (an executable) or "command" (an argv array)')
        elif not has_file(main, True):
            found.append(f"{main} is missing or not executable (chmod +x)")
    api = manifest.get("api", api_version)
    if not isinstance(api, int) or isinstance(api, bool) or api < 1:
        found.append("api must be a whole number, such as 1")
    elif api > api_version:
        found.append(f"needs plugin API {api}, this QryG supports {api_version}; update QryG first")
    try:
        manifest_files(manifest)
    except CliError as error:
        found.append(str(error))
    return found


def check(folder, api_version):
    try:
        manifest = json.loads((folder / "manifest.json").read_text())
    except OSError:
        raise CliError(f"{folder} has no manifest.json")
    except ValueError as error:
        raise CliError(f"manifest.json is not valid JSON: {error}")

    def has_file(path, executable):
        file = folder / path
        return file.is_file() and (not executable or os.access(file, os.X_OK))

    found = problems(manifest, has_file, api_version)
    if found:
        raise CliError("this plugin cannot be installed: " + "; ".join(found))
    return manifest


def card(manifest, source, target, existing):
    replaces = f"the installed {existing.get('name', existing['id'])} {existing.get('version', '')}".rstrip() if existing else "nothing, it is new"
    return [
        ("Name", manifest["name"]),
        ("ID", manifest["id"]),
        ("Version", manifest.get("version") or "unknown"),
        ("Author", manifest.get("author") or "unknown"),
        ("Type", RISKS[manifest["type"]]),
        ("Source", source),
        ("Folder", str(target)),
        ("Replaces", replaces),
    ]


def download(url, dest, limit):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    size = 0
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response, open(dest, "wb") as out:
            while chunk := response.read(65536):
                size += len(chunk)
                if size > limit:
                    raise CliError(f"{url} is larger than {limit // 1024 // 1024 or 1} MB")
                out.write(chunk)
    except urllib.error.HTTPError as error:
        error.close()
        raise CliError(f"could not download {url}: HTTP {error.code}")
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise CliError(f"could not download {url}: {getattr(error, 'reason', error)}")
    return size


def git(*args, cwd=None):
    try:
        result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True,
                                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    except FileNotFoundError:
        raise CliError("git is not installed; install it to fetch plugins from git")
    if result.returncode != 0:
        raise CliError(result.stderr.strip().splitlines()[-1] if result.stderr.strip() else f"git {args[0]} failed")


def fetch_git(spec, dest):
    git("init", "-q", str(dest))
    git("remote", "add", "origin", spec["repo"], cwd=dest)
    git("fetch", "-q", "--depth", "1", *(["--filter=blob:none"] if spec["subdir"] else []),
        "origin", spec["ref"] or "HEAD", cwd=dest)
    if spec["subdir"]:
        git("sparse-checkout", "set", "--no-cone", f"/{spec['subdir']}/", cwd=dest)
    git("checkout", "-q", "FETCH_HEAD", cwd=dest)
    root = dest / spec["subdir"]
    if not root.is_dir():
        raise CliError(f"{spec['ref']} has no folder {spec['subdir']}")
    return root


def inside(root, path):
    real = os.path.realpath(path)
    return real == root or real.startswith(root + os.sep)


def extract(archive, dest):
    root = os.path.realpath(dest)
    total = 0

    def place(name, size, kind, link=None, mode=0o644, read=None):
        nonlocal total
        if not [part for part in name.split("/") if part not in ("", ".")]:
            return
        clean = safe_relative(name, "archive entry")
        total += size
        if total > MAX_BYTES:
            raise CliError(f"the archive unpacks to more than {MAX_BYTES // 1024 // 1024} MB")
        target = dest / clean
        if not inside(root, target.parent):
            raise CliError(f"archive entry {name} points outside the plugin")
        if kind == "dir":
            target.mkdir(parents=True, exist_ok=True)
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        if kind == "link":
            if link.startswith("/"):
                raise CliError(f"archive link {name} points outside the plugin")
            target.symlink_to(link)
            if not inside(root, target):
                raise CliError(f"archive link {name} points outside the plugin")
            return
        if target.is_symlink():
            target.unlink()
        with read() as source, open(target, "wb") as out:
            shutil.copyfileobj(source, out)
        target.chmod(0o755 if mode & 0o111 else 0o644)

    try:
        unpack(archive, place)
    except (OSError, zipfile.BadZipFile, tarfile.TarError, UnicodeDecodeError) as error:
        raise CliError(f"could not unpack the archive: {error}")


def unpack(archive, place):
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as bundle:
            for info in bundle.infolist():
                mode = info.external_attr >> 16
                if info.is_dir():
                    place(info.filename, 0, "dir")
                elif stat.S_ISLNK(mode):
                    place(info.filename, 0, "link", link=bundle.read(info).decode())
                else:
                    place(info.filename, info.file_size, "file", mode=mode, read=lambda i=info: bundle.open(i))
        return
    try:
        bundle = tarfile.open(archive)
    except tarfile.TarError:
        raise CliError("the download is not a zip or tar archive")
    with bundle:
        for member in bundle:
            if member.isdir():
                place(member.name, 0, "dir")
            elif member.issym():
                place(member.name, 0, "link", link=member.linkname)
            elif member.isfile():
                place(member.name, member.size, "file", mode=member.mode, read=lambda m=member: bundle.extractfile(m))
            else:
                raise CliError(f"archive entry {member.name} is not a file, folder or link")


def entries(folder):
    return sorted(p for p in folder.iterdir() if p.name not in IGNORED and not p.name.startswith("."))


def locate(root, spec):
    base = root
    if not (base / "manifest.json").is_file():
        top = entries(base)
        if len(top) == 1 and top[0].is_dir() and not top[0].is_symlink():
            base = top[0]
    if (base / "manifest.json").is_file():
        return base
    found = sorted({p.parent for p in [*base.glob("*/manifest.json"), *base.glob("plugins/*/manifest.json")]
                    if p.parent.name not in IGNORED and not p.parent.name.startswith(".")})
    if len(found) == 1:
        return found[0]
    if not found:
        raise CliError(f"no manifest.json found in {spec['source']}")
    names = [p.relative_to(root).as_posix() for p in found]
    if spec["kind"] == "archive":
        raise CliError(f"this archive holds several plugins ({', '.join(names)}); unpack it and install one folder")
    prefix = f"{spec['subdir']}/" if spec["subdir"] else ""
    example = subfolder_url(spec["repo"], f"{prefix}{names[0]}", spec["ref"] or "HEAD")
    hint = f", for example:\n  qryg-search plugin install {example}" if example else ""
    raise CliError(f"this repository holds several plugins ({', '.join(names)}); pass the URL of one folder{hint}")


def fetch(spec, tmp):
    kind = spec["kind"]
    if kind == "folder":
        return Path(spec["source"]).expanduser().resolve()
    if kind in ("git", "subdir"):
        return locate(fetch_git(spec, tmp / "repo"), spec)
    if kind == "archive":
        archive = tmp / "download"
        if is_url(spec["source"]):
            download(spec["source"], archive, MAX_BYTES)
        else:
            archive = Path(spec["source"]).expanduser()
        unpacked = tmp / "unpacked"
        unpacked.mkdir()
        extract(archive, unpacked)
        return locate(unpacked, spec)
    folder = tmp / "plugin"
    folder.mkdir()
    download(spec["source"], folder / "manifest.json", MAX_MANIFEST_BYTES)
    try:
        manifest = json.loads((folder / "manifest.json").read_text())
    except ValueError as error:
        raise CliError(f"{spec['source']} is not valid JSON: {error}")
    if not isinstance(manifest, dict):
        raise CliError(f"{spec['source']} is not a plugin manifest")
    budget = MAX_BYTES
    for path in manifest_files(manifest):
        target = folder / path
        target.parent.mkdir(parents=True, exist_ok=True)
        budget -= download(file_url(spec["source"], path), target, budget)
    if manifest.get("type") == "script" and isinstance(manifest.get("main"), str):
        (folder / safe_relative(manifest["main"])).chmod(0o755)
    return folder


# Builds the new folder beside the old one and swaps it in, so a failed install keeps the old plugin.
def replace_dir(folder, target, link=False, extra=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(dir=target.parent.parent, prefix=".install-"))
    try:
        new, old = staging / "new", staging / "old"
        if link:
            new.symlink_to(folder)
        else:
            shutil.copytree(folder, new, ignore=shutil.ignore_patterns(*IGNORED))
            for name, text in (extra or {}).items():
                (new / name).write_text(text)
        if target.is_symlink() or target.exists():
            os.rename(target, old)
        try:
            os.rename(new, target)
        except OSError:
            if old.is_symlink() or old.exists():
                os.rename(old, target)
            raise
    except OSError as error:
        raise CliError(f"could not install to {target}: {error}")
    finally:
        shutil.rmtree(staging, ignore_errors=True)
