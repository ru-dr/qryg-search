// SPDX-License-Identifier: GPL-3.0-or-later
// Installs a plugin from a folder or URL for the preferences window. It only uses Gio, GLib and Soup, never St or
// Main. cli/qryg_search/remote.py is the command line version: keep them in step.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {API_VERSION, USER_PLUGIN_DIR, hasFileIn} from './manifest.js';
import {manifestProblems} from './rules.js';
import * as R from './remote.js';

Gio._promisify(Soup.Session.prototype, 'send_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

const USER_AGENT = 'qryg-search (+https://github.com/ru-dr/qryg-search)';
const MISSING = {
    git: 'git is not installed; install it to fetch plugins from git',
    tar: 'tar is not installed; install it to unpack .tar archives',
    unzip: 'unzip is not installed; install it to unpack .zip archives',
};

let session = null;

const join = (...parts) => GLib.build_filenamev(parts);
const isDir = path => GLib.file_test(path, GLib.FileTest.IS_DIR);
const isFile = path => GLib.file_test(path, GLib.FileTest.IS_REGULAR);
const exists = path => Gio.File.new_for_path(path).query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) !==
    Gio.FileType.UNKNOWN;

async function run(argv, cancellable, cwd = null) {
    if (!GLib.find_program_in_path(argv[0]))
        throw new Error(MISSING[argv[0]] ?? `${argv[0]} is not installed`);
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
    launcher.setenv('GIT_TERMINAL_PROMPT', '0', true);
    launcher.setenv('LC_ALL', 'C', true);
    if (cwd)
        launcher.set_cwd(cwd);
    const proc = launcher.spawnv(argv);
    const id = cancellable?.connect(() => proc.force_exit()) ?? 0;
    try {
        const [stdout, stderr] = await proc.communicate_utf8_async(null, cancellable);
        if (!proc.get_successful())
            throw new Error(stderr?.trim().split('\n').at(-1) || `${argv.slice(0, 2).join(' ')} failed`);
        return stdout ?? '';
    } finally {
        if (id)
            cancellable.disconnect(id);
    }
}

async function download(url, path, limit, cancellable) {
    const tooBig = () => new Error(`${url} is larger than ${Math.floor(limit / 1024 / 1024) || 1} MB`);
    const output = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
    let size = 0;
    try {
        if (url.startsWith('file://')) {
            const [bytes] = await Gio.File.new_for_uri(url).load_contents_async(cancellable);
            if (bytes.length > limit)
                throw tooBig();
            await output.write_bytes_async(new GLib.Bytes(bytes), GLib.PRIORITY_DEFAULT, cancellable);
            return bytes.length;
        }
        const message = Soup.Message.new('GET', url);
        if (!message)
            throw new Error(`could not download ${url}: not a valid URL`);
        session ??= new Soup.Session({timeout: 30, user_agent: USER_AGENT});
        const input = await session.send_async(message, GLib.PRIORITY_DEFAULT, cancellable);
        const status = message.get_status();
        if (status < 200 || status >= 300)
            throw new Error(`could not download ${url}: HTTP ${status}`);
        for (;;) {
            const chunk = await input.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, cancellable);
            if (chunk.get_size() === 0)
                break;
            size += chunk.get_size();
            if (size > limit)
                throw tooBig();
            await output.write_bytes_async(chunk, GLib.PRIORITY_DEFAULT, cancellable);
        }
        input.close(null);
        return size;
    } catch (e) {
        if (e instanceof GLib.Error && !e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            throw new Error(`could not download ${url}: ${e.message}`, {cause: e});
        throw e;
    } finally {
        output.close(null);
    }
}

function children(dir) {
    const out = [];
    const it = Gio.File.new_for_path(dir).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    let info;
    while ((info = it.next_file(null)) !== null)
        out.push(info.get_name());
    it.close(null);
    return out.sort();
}

function findLinks(dir, out = []) {
    const it = Gio.File.new_for_path(dir).enumerate_children('standard::name,standard::type',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    let info;
    while ((info = it.next_file(null)) !== null) {
        const path = join(dir, info.get_name());
        if (info.get_file_type() === Gio.FileType.SYMBOLIC_LINK)
            out.push(path);
        else if (info.get_file_type() === Gio.FileType.DIRECTORY)
            findLinks(path, out);
    }
    it.close(null);
    return out;
}

async function realpath(paths, cancellable) {
    return (await run(['realpath', '-m', '--', ...paths], cancellable)).split('\n').filter(Boolean);
}

async function fetchGit(spec, dest, cancellable) {
    await run(['git', 'init', '-q', dest], cancellable);
    await run(['git', 'remote', 'add', 'origin', spec.repo], cancellable, dest);
    await run(['git', 'fetch', '-q', '--depth', '1', ...spec.subdir ? ['--filter=blob:none'] : [],
        'origin', spec.ref ?? 'HEAD'], cancellable, dest);
    if (spec.subdir)
        await run(['git', 'sparse-checkout', 'set', '--no-cone', `/${spec.subdir}/`], cancellable, dest);
    await run(['git', 'checkout', '-q', 'FETCH_HEAD'], cancellable, dest);
    const root = join(dest, spec.subdir);
    if (!isDir(root))
        throw new Error(`${spec.ref} has no folder ${spec.subdir}`);
    return root;
}

function isZip(path) {
    const stream = Gio.File.new_for_path(path).read(null);
    const head = stream.read_bytes(4, null).get_data();
    stream.close(null);
    return head?.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;
}

async function extract(archive, dest, cancellable) {
    if (isZip(archive)) {
        const listing = await run(['unzip', '-Z', archive], cancellable);
        const entries = R.zipEntries(await run(['unzip', '-Z1', archive], cancellable), listing);
        R.checkEntries(entries, R.MAX_BYTES, R.zipSize(listing));
        await run(['unzip', '-q', archive, '-d', dest], cancellable);
    } else {
        const names = await run(['tar', '-tf', archive], cancellable);
        R.checkEntries(R.tarEntries(names, await run(['tar', '-tvf', archive], cancellable)));
        await run(['tar', '-xf', archive, '-C', dest, '--no-same-owner'], cancellable);
    }
}

// Refuses links that lead outside the plugin folder, so copying it never pulls in other files.
async function checkLinks(folder, cancellable) {
    const links = findLinks(folder);
    if (links.length === 0)
        return;
    const [root, ...targets] = await realpath([folder, ...links], cancellable);
    targets.forEach((target, i) => {
        if (target !== root && !target.startsWith(`${root}/`))
            throw new Error(`${links[i].slice(folder.length + 1)} links outside the plugin folder`);
    });
}

function entries(dir) {
    return children(dir).filter(name => !R.IGNORED.includes(name) && !name.startsWith('.'));
}

function locate(root, spec) {
    let base = root;
    if (!isFile(join(base, 'manifest.json'))) {
        const top = entries(base);
        const only = top.length === 1 ? join(base, top[0]) : null;
        if (only && isDir(only) && !GLib.file_test(only, GLib.FileTest.IS_SYMLINK))
            base = only;
    }
    if (isFile(join(base, 'manifest.json')))
        return base;
    const found = new Set();
    for (const [parent, prefix] of [[base, ''], [join(base, 'plugins'), 'plugins/']]) {
        if (!isDir(parent))
            continue;
        for (const name of entries(parent)) {
            if (isFile(join(parent, name, 'manifest.json')))
                found.add(join(base, `${prefix}${name}`).slice(root.length + 1));
        }
    }
    return join(root, R.pluginChoice([...found].sort(), spec));
}

async function fetchManifest(spec, folder, cancellable) {
    GLib.mkdir_with_parents(folder, 0o755);
    await download(spec.source, join(folder, 'manifest.json'), R.MAX_MANIFEST_BYTES, cancellable);
    let manifest;
    try {
        manifest = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(join(folder, 'manifest.json'))[1]));
    } catch (e) {
        throw new Error(`${spec.source} is not valid JSON: ${e.message}`, {cause: e});
    }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
        throw new Error(`${spec.source} is not a plugin manifest`);
    let budget = R.MAX_BYTES;
    for (const path of R.manifestFiles(manifest)) {
        const target = join(folder, path);
        GLib.mkdir_with_parents(GLib.path_get_dirname(target), 0o755);
        budget -= await download(R.fileUrl(spec.source, path), target, budget, cancellable);
    }
    if (manifest.type === 'script' && typeof manifest.main === 'string')
        GLib.chmod(join(folder, R.safeRelative(manifest.main)), 0o755);
    return folder;
}

function readManifest(folder) {
    try {
        return JSON.parse(new TextDecoder().decode(GLib.file_get_contents(join(folder, 'manifest.json'))[1]));
    } catch (e) {
        if (e instanceof SyntaxError)
            throw new Error(`manifest.json is not valid JSON: ${e.message}`, {cause: e});
        throw new Error(`${folder} has no manifest.json`, {cause: e});
    }
}

function check(folder) {
    const manifest = readManifest(folder);
    const found = manifestProblems(manifest, hasFileIn(folder), API_VERSION);
    if (found.length > 0)
        throw new Error(`this plugin cannot be installed: ${found.join('; ')}`);
    return manifest;
}

function expand(path) {
    return path === '~' || path.startsWith('~/') ? GLib.get_home_dir() + path.slice(1) : path;
}

async function fetchInto(spec, work, cancellable) {
    switch (spec.kind) {
    case 'folder':
        return (await realpath([expand(spec.source)], cancellable))[0];
    case 'git':
    case 'subdir':
        return locate(await fetchGit(spec, join(work, 'repo'), cancellable), spec);
    case 'archive': {
        let archive = join(work, 'download');
        if (R.isUrl(spec.source))
            await download(spec.source, archive, R.MAX_BYTES, cancellable);
        else
            archive = expand(spec.source);
        const unpacked = join(work, 'unpacked');
        GLib.mkdir_with_parents(unpacked, 0o755);
        await extract(archive, unpacked, cancellable);
        return locate(unpacked, spec);
    }
    default:
        return fetchManifest(spec, join(work, 'plugin'), cancellable);
    }
}

// Fetches and checks a plugin without installing it. Pass the result to install(), then always to discard().
export async function fetchPlugin(source, cancellable = null) {
    const spec = R.classify(source.trim());
    const base = GLib.path_get_dirname(USER_PLUGIN_DIR);
    GLib.mkdir_with_parents(USER_PLUGIN_DIR, 0o755);
    const staging = join(base, `.install-${GLib.uuid_string_random().slice(0, 8)}`);
    Gio.File.new_for_path(staging).make_directory(null);
    GLib.mkdir_with_parents(join(staging, 'work'), 0o700);
    const fetched = {spec, staging, source: spec.source, folder: null, manifest: null, target: null, existing: null, card: []};
    try {
        if (!R.isUrl(spec.source))
            [fetched.source] = await realpath([expand(spec.source)], cancellable);
        fetched.folder = await fetchInto(spec, join(staging, 'work'), cancellable);
        await checkLinks(fetched.folder, cancellable);
        fetched.manifest = check(fetched.folder);
        fetched.target = join(USER_PLUGIN_DIR, fetched.manifest.id);
        const [resolved] = await realpath([fetched.target], cancellable);
        if (fetched.folder === resolved || fetched.folder.startsWith(`${resolved}/`))
            throw new Error(`${fetched.folder} is already installed here; edit it in place, then reload plugins`);
        if (exists(fetched.target)) {
            try {
                fetched.existing = readManifest(fetched.target);
            } catch {}
        }
        fetched.card = R.card(fetched.manifest, spec.source, fetched.target, fetched.existing?.id ? fetched.existing : null);
        return fetched;
    } catch (e) {
        await discard(fetched);
        throw e;
    }
}

export async function install(fetched, cancellable = null) {
    const {spec, staging, source, folder, target} = fetched;
    const fresh = join(staging, 'new');
    const old = Gio.File.new_for_path(join(staging, 'old'));
    await run(['cp', '-RP', '--preserve=mode,timestamps', '--', folder, fresh], cancellable);
    await run(['find', fresh, '-depth', '(', '-name', '.git', '-o', '-name', '__MACOSX', ')', '-exec', 'rm', '-rf', '{}', '+'],
        cancellable);
    GLib.file_set_contents(join(fresh, R.SOURCE_FILE), `${JSON.stringify({source, kind: spec.kind, ref: spec.ref})}\n`);
    const file = Gio.File.new_for_path(target);
    const replacing = exists(target);
    if (replacing)
        file.move(old, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS, null, null);
    try {
        Gio.File.new_for_path(fresh).move(file, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS, null, null);
    } catch (e) {
        if (replacing)
            old.move(file, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS, null, null);
        throw e;
    }
    return target;
}

export async function discard(fetched) {
    try {
        await run(['rm', '-rf', '--', fetched.staging], null);
    } catch (e) {
        logError(e, 'qryg-search: could not remove the install folder');
    }
}
