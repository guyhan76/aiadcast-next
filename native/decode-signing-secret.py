#!/usr/bin/env python3
"""Decode clipboard Base64, allowing whitespace but rejecting other characters."""
import base64
import binascii
import os
from pathlib import Path

value = ''.join(os.environ['KEYSTORE_BASE64'].split())
if value in ('AIADCAST_DEMO_KEYSTORE_BASE64', 'AIADCAST_DEMO_STORE_PASSWORD'):
    raise SystemExit('The secret contains a setting name instead of the encoded key file. Re-copy the file after opening the existing secret edit form.')
if '[Convert]' in value or 'ReadAllBytes' in value or 'Set-Clipboard' in value:
    raise SystemExit('The secret contains a PowerShell command instead of its clipboard result. Run the command, then paste the clipboard directly into the existing secret value.')
try:
    decoded = base64.b64decode(value, validate=True)
except (binascii.Error, ValueError):
    raise SystemExit('Signing file secret is not valid Base64. Re-copy the file and update the existing secret value without copying its name again.') from None
if not decoded or not (decoded[0] == 0x30 or decoded.startswith(bytes.fromhex('feedfeed'))):
    raise SystemExit('Decoded signing file is not a PKCS12/JKS keystore. Use the Base64 of the original key file.')
destination = Path(os.environ['AIADCAST_DEMO_KEYSTORE'])
with destination.open('xb') as output:
    os.chmod(destination, 0o600)
    output.write(decoded)
print('Signing file decoded. No key material logged.')
