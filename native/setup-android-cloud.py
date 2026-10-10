#!/usr/bin/env python3
"""Prepare pinned Android compilation tools under /tmp without system writes.

The downloads were checked against the official repository metadata on 2026-10-10.
This is build tooling, never included in the customer APK. Keep inherited proxy/TLS.
"""
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import tarfile
import urllib.parse
import urllib.request
import zipfile

ROOT = Path('/tmp/aiadcast-android-tools')
ARTIFACTS = [
    ('jdk.tar.gz', 'https://download.oracle.com/java/21/archive/jdk-21.0.12.1_linux-x64_bin.tar.gz', '12f870b21301b42292558a3f872ce543affa2b86cb6458591c78388c41ddb111'),
    ('platform-36_r02.zip', 'https://dl.google.com/android/repository/platform-36_r02.zip', '37607369a28c5b640b3a7998868d45898ebcb777565a0e85f9acf36f29631d2e'),
    ('build-tools_r36_linux.zip', 'https://dl.google.com/android/repository/build-tools_r36_linux.zip', '5d9ac77fb6ff43d9da518a337b4fcf8f9097113df531d99ccefe80ef7ce8250b'),
    ('platform-tools_r37.0.1-linux.zip', 'https://dl.google.com/android/repository/platform-tools_r37.0.1-linux.zip', 'd230f13842f60f782a8645f9c813f8f845bf36089ea7289f28c48f17979313f1'),
]


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def unpack_zip(path, destination):
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not (destination / name).resolve().is_relative_to(destination.resolve()):
                raise RuntimeError('Unsafe archive path')
        archive.extractall(destination)


ROOT.mkdir(parents=True, exist_ok=True)
for name, url, checksum in ARTIFACTS:
    archive = ROOT / name
    if not archive.exists() or sha256(archive) != checksum:
        temporary = archive.with_suffix('.download')
        with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        if sha256(temporary) != checksum:
            temporary.unlink()
            raise RuntimeError('Artifact checksum mismatch: ' + name)
        temporary.replace(archive)
    print('Verified', name)

jdk = ROOT / 'jdk/jdk-21.0.12.1'
if not (jdk / 'bin/javac').exists():
    with tarfile.open(ROOT / 'jdk.tar.gz') as archive:
        archive.extractall(ROOT / 'jdk', filter='data')
sdk = ROOT / 'sdk'
if not (sdk / 'platforms/android-36/android.jar').exists():
    unpack_zip(ROOT / 'platform-36_r02.zip', ROOT / 'sdk-extracted')
    shutil.copytree(ROOT / 'sdk-extracted/android-36', sdk / 'platforms/android-36', dirs_exist_ok=True)
if not (sdk / 'build-tools/36.0.0/aapt2').exists():
    unpack_zip(ROOT / 'build-tools_r36_linux.zip', ROOT / 'sdk-extracted')
    shutil.copytree(ROOT / 'sdk-extracted/android-16', sdk / 'build-tools/36.0.0', dirs_exist_ok=True)
if not (sdk / 'platform-tools/adb').exists():
    unpack_zip(ROOT / 'platform-tools_r37.0.1-linux.zip', sdk)
for path in (sdk / 'build-tools/36.0.0').iterdir():
    if path.is_file() and path.suffix not in ('.txt', '.properties', '.jar'):
        path.chmod(path.stat().st_mode | 0o111)
for command in ('adb', 'fastboot'):
    (sdk / 'platform-tools' / command).chmod(0o755)

gradle_cache = ROOT / 'gradle-cache'
android_user = ROOT / 'android-user'
gradle_cache.mkdir(exist_ok=True)
android_user.mkdir(exist_ok=True)
proxy = urllib.parse.urlparse(os.environ.get('HTTPS_PROXY', ''))
properties = 'org.gradle.java.installations.auto-download=false\n'
if proxy.hostname:
    for scheme in ('http', 'https'):
        properties += f'systemProp.{scheme}.proxyHost={proxy.hostname}\nsystemProp.{scheme}.proxyPort={proxy.port or 80}\n'
trust = Path('/etc/ssl/certs/java/cacerts')
if trust.exists():
    properties += f'systemProp.javax.net.ssl.trustStore={trust}\n'
(gradle_cache / 'gradle.properties').write_text(properties)
bindings = {'JAVA_HOME': jdk, 'ANDROID_HOME': sdk, 'ANDROID_USER_HOME': android_user, 'GRADLE_USER_HOME': gradle_cache}
(ROOT / 'env.sh').write_text(''.join(f'export {key}={shlex.quote(str(value))}\n' for key, value in bindings.items()))
(ROOT / 'toolchain-info.json').write_text(json.dumps({'checkedOn': '2026-10-10', 'artifacts': [{'name': n, 'url': u, 'sha256': s} for n, u, s in ARTIFACTS]}, indent=2))
print('Tooling ready. Source /tmp/aiadcast-android-tools/env.sh before the Android build.')
