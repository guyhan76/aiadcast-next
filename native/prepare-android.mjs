import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const destination = join(root, 'android/app/src/main/assets');
const index = await readFile(join(dist, 'index.html'), 'utf8');
if (!index.includes('<div id="root">')) throw new Error('Build output is not the aiadcast app. Run npm run build first.');
const hash = createHash('sha256');
async function checkFiles(folder) {
  for (const item of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(folder, item.name);
    if (item.isDirectory()) { await checkFiles(path); continue; }
    if (!/\.(html|js|css|json)$/.test(item.name)) continue;
    const bytes = await readFile(path);
    const text = bytes.toString('utf8');
    if (/sk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{20,}/.test(text)) throw new Error('A provider-like secret was found in web assets. Do not package this build.');
    if (/https?:\/\/api\.openai\.com/.test(text)) throw new Error('Web assets must call the company backend, not a provider directly.');
    hash.update(path.slice(dist.length)).update(bytes);
  }
}
await checkFiles(dist);
const webBuild=JSON.parse(await readFile(join(dist,'web-build.json'),'utf8'));
if(webBuild.schemaVersion!==1||typeof webBuild.version!=='string'||!(webBuild.commit===null||/^[a-f0-9]{40}$/.test(webBuild.commit)))throw new Error('Invalid web build metadata');
if (resolve(destination) !== join(root, 'android/app/src/main/assets')) throw new Error('Unexpected asset destination');
await mkdir(destination, { recursive: true });
for (const item of await readdir(destination)) if (item !== '.gitkeep') await rm(join(destination, item), { recursive: true, force: true });
await cp(dist, destination, { recursive: true });
await cp(join(root, 'native/android-download-bridge.js'), join(destination, 'native-bridge.js'));
await writeFile(join(destination, 'native-build.json'), JSON.stringify({ schemaVersion: 1, webBuild, webBuildDigest: hash.digest('hex'), packagedAt: new Date().toISOString(), productionReady: false }, null, 2));
console.log('Bundled web assets prepared for Android. Production billing and release approval are not enabled.');
