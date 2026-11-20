import {createHash} from 'node:crypto';
import {verifyWebBuild} from './check-web-build.mjs';

const expectedCommit = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(expectedCommit || '')) throw Error('Expected a full release commit');
const origin = 'https://aiadcast-next.onrender.com';
async function read(path) {
  const response = await fetch(new URL(path, origin), {
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)
  });
  if (!response.ok) throw Error('Public web '+path+' returned '+response.status);
  return Buffer.from(await response.arrayBuffer());
}

const manifest = JSON.parse(await read('/web-release.json?check='+Date.now()));
if (manifest.schema !== 1 || manifest.commit !== expectedCommit) {
  throw Error('Public web serves '+manifest.commit+'; the APK requires '+expectedCommit);
}
const metadata = await read('/web-build.json');
verifyWebBuild(JSON.parse(metadata),{expectedCommit,requireCommit:true});

function verifyAsset(name, bytes) {
  const entry = manifest.files[name];
  if (entry?.size !== bytes.length || entry.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
    throw Error('Public bytes differ from the Android web manifest: '+name);
  }
}
verifyAsset('web-build.json', metadata);
verifyAsset('index.html', await read('/'));
for (const name of Object.keys(manifest.files).filter(name=>/\.(js|css)$/.test(name))) {
  verifyAsset(name, await read('/'+name));
}
console.log('Browser entry, scripts, styles and Android web manifest verified at '+expectedCommit);
