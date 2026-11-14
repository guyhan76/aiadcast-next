#!/usr/bin/env python3
"""Verify public signing identity before compiling; never print private material."""
import os
import re
import subprocess

profile = os.environ.get('AIADCAST_SIGNING_PROFILE', 'demo')
identities = {
    'demo': '576ead9f546b2d227250323d688c9087b0e206bf101b8560a9922b1ee793b638',
    # Certificate extracted from the owner's 2026-11-07 signed Preview 0.2.80 APK.
    'preview': '7dc020bc774784d3df553c58c672f4210d232e2543004fd52ac9084943488b4e',
}
if profile not in identities:
    raise SystemExit('Unknown signing profile')
expected = identities[profile]
result = subprocess.run([
    'keytool', '-J-Duser.language=en', '-J-Duser.country=US', '-list', '-v',
    '-keystore', os.environ['AIADCAST_DEMO_KEYSTORE'], '-storepass:env', 'STORE_PASSWORD',
], text=True, capture_output=True)
if result.returncode:
    raise SystemExit('Cannot verify keystore: check the signing file and repository password secret.')
matches = []
for block in result.stdout.split('Alias name: ')[1:]:
    alias = block.splitlines()[0].strip()
    if 'Entry type: PrivateKeyEntry' not in block:
        continue
    fingerprint = re.search(r'SHA256:\s*([0-9A-Fa-f:]+)', block)
    if fingerprint and fingerprint.group(1).replace(':', '').lower() == expected:
        if not re.fullmatch(r'[A-Za-z0-9._-]{1,128}', alias):
            raise SystemExit('Signing alias needs an explicit safe configuration.')
        matches.append(alias)
if len(matches) != 1:
    raise SystemExit(f'Keystore does not contain exactly one matching {profile} signing identity. No update APK will be signed.')
with open(os.environ['GITHUB_ENV'], 'a') as output:
    output.write('AIADCAST_DEMO_KEY_ALIAS=' + matches[0] + '\n')
print(f'Existing {profile} signing certificate verified. Private key access is checked during signing.')
