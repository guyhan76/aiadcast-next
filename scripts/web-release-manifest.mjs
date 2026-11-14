import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Both the Docker web build and the APK build run this Vite hook after dist is complete.
export async function writeWebReleaseManifest(directory, commit) {
  const files = {};
  async function scan(relative) {
    for (const entry of await readdir(join(directory, relative), {withFileTypes: true})) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        await scan(name);
      } else if (entry.isFile() && name !== 'web-release.json') {
        const bytes = await readFile(join(directory, name));
        files[name] = {sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length};
      }
    }
  }
  await scan('');
  for (const name of ['index.html', 'web-build.json']) {
    if (!files[name]) throw new Error('Incomplete web build: ' + name);
  }
  await writeFile(join(directory, 'web-release.json'), JSON.stringify({schema: 1, commit, files}));
}
