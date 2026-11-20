import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { sourceHash } from '../server/vision-evaluation/analysis.mjs';
import { composeDiagnostic } from '../server/vision-evaluation/overlay.mjs';

// Deterministic renderer example, NOT an AI localization result or user reference.
const source = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#f1ebe0"/><text x="80" y="90" font-family="sans-serif" font-size="32">LOCAL MOCK - NO AI ANALYSIS</text><path d="M 96 300 L 288 300 L 384 220 L 192 220 Z" fill="#cca878"/><path d="M 96 300 L 288 300 L 288 500 L 96 500 Z" fill="#b69163"/><path d="M 288 300 L 384 220 L 384 400 L 288 500 Z" fill="#967346"/><text x="80" y="870" font-family="sans-serif" font-size="26">Protected ad copy stays unchanged</text></svg>`)).png().toBuffer();
const proposal = { located: true, product: [.1, .2, .4, .35], axes: { width: [[.12, .5], [.36, .5]], depth: [[.36, .5], [.48, .4]], height: [[.48, .4], [.48, .22]] }, protectedText: [[.1, .04, .8, .08], [.1, .82, .8, .08]], existingAnnotations: [], inset: [.65, .35, .3, .4] };
const dimensions = { width: '300', depth: '200', height: '100' };
const main = await composeDiagnostic({ bytes: source, expectedHash: sourceHash(source), proposal, dimensions });
const inset = await composeDiagnostic({ bytes: source, expectedHash: sourceHash(source), proposal, dimensions, mode: 'inset' });
if ([main, inset].some(r => r.state !== 'review-required')) throw Error('MOCK_RENDER_FAILED');
const headings = ['ORIGINAL MOCK', 'MOCK AXES / MAIN', 'MOCK AXES / SAME PIXELS INSET'];
const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="80"><rect width="2400" height="80" fill="white"/>${headings.map((s, i) => `<text x="${i * 800 + 25}" y="50" font-family="sans-serif" font-size="28">${s}</text>`).join('')}</svg>`);
const png = await sharp({ create: { width: 2400, height: 1080, channels: 3, background: 'white' } }).composite([{ input: header, left: 0, top: 0 }, ...[source, main.bytes, inset.bytes].map((input, i) => ({ input, left: i * 800, top: 80 }))]).png().toBuffer();
await mkdir('artifacts/showcase/vision-evaluation', { recursive: true });
await writeFile('artifacts/showcase/vision-evaluation/mock-comparison.png', png);
await writeFile('artifacts/showcase/vision-evaluation/README.txt', 'LOCAL MOCK ONLY. Known fixture coordinates, no model detection and no paid API call. Original user references were not downloaded or evaluated. Orange lines show deterministic overlay rendering, not proven real-image localization.\n');
console.log('Mock comparison saved; no provider used.');
