import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { VisionLedger } from '../server/vision-evaluation/ledger.mjs';
import { analyzeApprovedImage } from '../server/vision-evaluation/analysis.mjs';
import { composeDiagnostic } from '../server/vision-evaluation/overlay.mjs';

// Deliberately separate from the beta server and all image generation routes.
// No dotenv load, arbitrary ledger path, provider selection or batch/retry option.
const ledgerPath = fileURLToPath(new URL('../secrets/vision-analysis-20261017.sqlite', import.meta.url));
async function main() {
  const [target, imagePath, outputPath] = process.argv.slice(2);
  if (!['22932.jpg', '22935.jpg'].includes(target) || !imagePath || !outputPath) throw Error('USAGE: node scripts/evaluate-dimension-placement.mjs <22932.jpg|22935.jpg> <input> <new-output.png>');
  if (!process.env.OPENAI_API_KEY) throw Error('PROVIDER_NOT_CONFIGURED');
  // Explicit prior setup preserves the shared ledger across invocations. Never
  // silently recreate a deleted ledger and restore the original budget.
  try { await access(ledgerPath); } catch { throw Error('SHARED_LEDGER_NOT_INITIALIZED'); }
  try { await access(outputPath); throw Error('OUTPUT_ALREADY_EXISTS'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const bytes = await readFile(imagePath);
  const ledger = new VisionLedger(ledgerPath);
  try {
    const result = await analyzeApprovedImage({ bytes, target, ledger, apiKey: process.env.OPENAI_API_KEY });
    if (!result.proposal) { console.log(JSON.stringify(result)); return; }
    const dimensions = target === '22932.jpg' ? { width: '300', depth: '200', height: '100' } : { width: '350', depth: '130', height: '260' };
    const output = await composeDiagnostic({ bytes, expectedHash: result.sourceHash, proposal: result.proposal, dimensions });
    await writeFile(outputPath, output.bytes, { flag: 'wx' });
    console.log(JSON.stringify({ state: output.state, reason: output.reason, costMicros: result.costMicros, callId: result.callId, verified: false, note: 'Diagnostic overlay; reference already has dimension arrows. Human comparison required.' }));
  } finally { ledger.close(); }
}
main().catch(error => { console.error(['PROVIDER_NOT_CONFIGURED', 'SHARED_LEDGER_NOT_INITIALIZED', 'OUTPUT_ALREADY_EXISTS', 'IMAGE_NOT_BOUND', 'RECONCILE_REQUIRED', 'APPROVAL_LIMIT'].includes(error.message) || error.message.startsWith('USAGE:') ? error.message : 'EVALUATION_STOPPED'); process.exitCode = 1; });
