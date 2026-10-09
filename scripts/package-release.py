"""Create a reproducible source handoff from a clean commit, never from untracked files."""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZIP_DEFLATED
import fnmatch
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent.parent
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)

if git('status', '--porcelain', '--untracked-files=normal').strip():
    raise SystemExit('Commit the reviewed changes before packaging. No files were staged or changed.')
commit = git('rev-parse', 'HEAD').decode().strip()
entries = git('ls-tree', '-r', '-z', 'HEAD').split(b'\0')
files = []
for entry in filter(None, entries):
    meta, raw_name = entry.split(b'\t', 1)
    mode, kind, object_id = meta.split()
    name = raw_name.decode()
    path = PurePosixPath(name)
    forbidden = ['.env*', '*.jks', '*.keystore', '*.p12', '*.pem', '*.key', '*service-account*.json', 'google-services.json', '*.db', '*.db-*', '*.sqlite', '*.sqlite-*']
    if path.is_absolute() or '..' in path.parts or 'secrets' in path.parts or mode not in [b'100644', b'100755']:
        raise SystemExit('Unsupported or sensitive archive path: ' + name)
    if any(fnmatch.fnmatch(path.name, pattern) for pattern in forbidden) and path.name != '.env.example':
        raise SystemExit('Sensitive archive path: ' + name)
    if kind != b'blob':
        raise SystemExit('Unsupported Git object: ' + name)
    files.append((name, object_id.decode()))

subprocess.run(['npm', 'run', 'build'], cwd=root, check=True)
subprocess.run(['node', 'scripts/export-brief.mjs'], cwd=root, check=True)
out = root / 'release'
bundle = out / 'aiadcast-next-source.bundle'
subprocess.run(['git', 'bundle', 'create', str(bundle), 'HEAD', 'main'], cwd=root, check=True)
subprocess.run(['git', 'bundle', 'verify', str(bundle)], cwd=root, check=True)
archive = out / 'aiadcast-studio-preview.zip'
manifest = {'project': 'aiadcast-next', 'commit': commit, 'kind': 'source-and-editor-preview', 'androidAppBuilt': False, 'files': {}}
with ZipFile(archive, 'w', ZIP_DEFLATED) as zipped:
    for name, object_id in files:
        data = git('cat-file', 'blob', object_id)
        zipped.writestr('source/' + name, data)
        manifest['files']['source/' + name] = hashlib.sha256(data).hexdigest()
    for name in ['aiadcast-studio.html', 'aiadcast-technical-brief.pdf', '사용안내.txt', 'FONT-LICENSE.txt', 'THIRD-PARTY-NOTICES.txt', bundle.name]:
        data = (out / name).read_bytes()
        zipped.writestr(name, data)
        manifest['files'][name] = hashlib.sha256(data).hexdigest()
    zipped.writestr('build-info.json', json.dumps(manifest, ensure_ascii=False, indent=2))
with ZipFile(archive) as zipped:
    if zipped.testzip() is not None:
        raise SystemExit('Archive verification failed')
    for name, expected in manifest['files'].items():
        if hashlib.sha256(zipped.read(name)).hexdigest() != expected:
            raise SystemExit('Checksum mismatch: ' + name)
print(json.dumps({'archive': str(archive), 'commit': commit, 'bytes': archive.stat().st_size, 'checksumVerified': True}))
