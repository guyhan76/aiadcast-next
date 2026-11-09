"""Store synthetic UI test screenshots as private repository blobs for review.

Only paths under test-results and explicitly named synthetic screenshots are read.
Credentials are used by gh from its environment and never printed.
"""
import base64
import json
import pathlib
import subprocess

names = {'category-browse.png', 'category-search.png', 'section-9-spacing.png'}
manifest = []
for path in sorted(pathlib.Path('test-results').rglob('*.png')):
    if path.name not in names or len(manifest) >= 12:
        continue
    data = path.read_bytes()
    if len(data) > 1_500_000:
        raise ValueError('UI screenshot exceeds review limit')
    payload = json.dumps({'content': base64.b64encode(data).decode('ascii'), 'encoding': 'utf-8'})
    result = subprocess.run(['gh', 'api', '--method', 'POST', 'repos/{owner}/{repo}/git/blobs', '--input', '-'], input=payload, text=True, capture_output=True, check=True)
    blob = json.loads(result.stdout)
    manifest.append({'path': str(path), 'sha': blob['sha'], 'bytes': len(data)})
print('UI_REVIEW_MANIFEST=' + json.dumps(manifest))
