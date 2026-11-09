#!/usr/bin/env python3
"""Use the wrapper's pinned distribution with the runner's inherited proxy/TLS."""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import urllib.parse
import zipfile

root = Path(__file__).resolve().parent.parent
properties = dict(line.split('=', 1) for line in
                  (root / 'android/gradle/wrapper/gradle-wrapper.properties').read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
url = properties['distributionUrl'].replace('\\:', ':')
checksum = properties['distributionSha256Sum']
match = re.fullmatch(r'https://downloads\.gradle\.org/distributions/gradle-([0-9.]+)-bin\.zip', url)
if not match or not re.fullmatch(r'[0-9a-f]{64}', checksum):
    raise SystemExit('Unsupported or unpinned Gradle distribution')
runtime = Path(os.environ['RUNNER_TEMP']) / 'aiadcast-gradle'
runtime.mkdir(mode=0o700, parents=True, exist_ok=True)
archive = runtime / 'gradle.zip'
subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                '--connect-timeout', '20', '--max-time', '180',
                '--output', str(archive), url], check=True)
if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum:
    archive.unlink()
    raise SystemExit('Gradle distribution checksum mismatch')
with zipfile.ZipFile(archive) as bundle:
    for item in bundle.infolist():
        if not (runtime / item.filename).resolve().is_relative_to(runtime.resolve()):
            raise SystemExit('Unsafe Gradle archive path')
    bundle.extractall(runtime)
gradle = runtime / f'gradle-{match.group(1)}/bin/gradle'
gradle.chmod(0o700)

def escape(value):
    return str(value).replace('\\', '\\\\').replace('\n', '\\n').replace('\r', '\\r').replace('=', '\\=').replace(':', '\\:')

home = runtime / 'home'
home.mkdir(mode=0o700, exist_ok=True)
settings = ['org.gradle.java.installations.auto-download=false']
for scheme in ('http', 'https'):
    value = os.environ.get(scheme + '_proxy') or os.environ.get(scheme.upper() + '_PROXY')
    if not value:
        continue
    proxy = urllib.parse.urlparse(value)
    if not proxy.hostname or proxy.scheme not in ('http', 'https'):
        raise SystemExit('Unsupported inherited proxy configuration')
    prefix = 'systemProp.' + scheme + '.'
    settings.extend([prefix + 'proxyHost=' + escape(proxy.hostname),
                     prefix + 'proxyPort=' + str(proxy.port or (443 if proxy.scheme == 'https' else 80))])
    for field, suffix in ((proxy.username, 'proxyUser'), (proxy.password, 'proxyPassword')):
        if field is not None:
            settings.append(prefix + suffix + '=' + escape(urllib.parse.unquote(field)))
no_proxy = os.environ.get('no_proxy') or os.environ.get('NO_PROXY')
if no_proxy:
    hosts = [item.strip() for item in no_proxy.split(',') if item.strip()]
    settings.append('systemProp.http.nonProxyHosts=' + escape('|'.join('*' + h if h.startswith('.') else h for h in hosts)))
config = home / 'gradle.properties'
config.touch(mode=0o600)
config.write_text('\n'.join(settings) + '\n')
with open(os.environ['GITHUB_ENV'], 'a') as output:
    output.write(f'AIADCAST_GRADLE={gradle}\nGRADLE_USER_HOME={home}\n')
print('Pinned Gradle distribution verified; inherited network settings prepared.')
