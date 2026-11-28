import sharp from 'sharp';
import { sourceHash } from './analysis.mjs';

import {annotationPlan as planOverlay,validateAnnotationProposal as validateProposal} from '../../src/dimension-annotation.ts';
export {planOverlay,validateProposal};

// Diagnostic result only. No app import or automatic production application.
// All rejection paths retain the original bytes and a non-success state.
export async function composeDiagnostic({ bytes, expectedHash, proposal, dimensions, mode = 'main' }) {
  try {
    if (sourceHash(bytes) !== expectedHash) throw Error('SOURCE_CHANGED');
    const original = await sharp(bytes).rotate().png().toBuffer({ resolveWithObject: true });
    const { width, height } = original.info;
    const plan = planOverlay(proposal, dimensions, mode, width, height);
    const layers = [];
    if (plan.inset) {
      const [x, y, w, h] = plan.product;
      const left = Math.floor(x * width), top = Math.floor(y * height);
      const crop = await sharp(original.data).extract({ left, top, width: Math.min(width - left, Math.floor(w * width)), height: Math.min(height - top, Math.floor(h * height)) })
        .resize(Math.max(1, Math.round(plan.inset[2] * width)), Math.max(1, Math.round(plan.inset[3] * height)), { fit: 'fill' }).png().toBuffer();
      layers.push({ input: crop, left: Math.round(plan.inset[0] * width), top: Math.round(plan.inset[1] * height) });
    }
    const drawings = plan.planned.map(e => {
      const [x, y, w, h] = e.label;
      return `<line x1="${e.a[0] * width}" y1="${e.a[1] * height}" x2="${e.b[0] * width}" y2="${e.b[1] * height}" stroke="#d14900" stroke-width="3" marker-start="url(#arrow)" marker-end="url(#arrow)"/><rect x="${x * width}" y="${y * height}" width="${w * width}" height="${h * height}" fill="white" stroke="#d14900"/><text x="${(x + w / 2) * width}" y="${(y + h * .72) * height}" text-anchor="middle" font-family="sans-serif" font-size="${plan.fontSize}" fill="#a33700">${e.text}</text>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 10 5 L 0 0 L 0 10 z" fill="#d14900"/></marker></defs>${drawings}</svg>`;
    layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
    const output = await sharp(original.data).composite(layers).png().toBuffer();
    return { state: 'review-required', bytes: output, original: bytes, plan, verified: false };
  } catch (error) {
    const reasons = ['SOURCE_CHANGED', 'PRODUCT_NOT_LOCATED', 'INVALID_TEXT_REGIONS', 'INVALID_EXISTING_ANNOTATIONS', 'INVALID_AXIS', 'INVALID_MODE', 'INVALID_SAVED_DIMENSIONS', 'NO_SAFE_INSET_SPACE', 'AXIS_COVERS_COPY', 'NO_SAFE_LABEL_SPACE'];
    return { state: 'original-preserved', bytes, verified: false, reason: reasons.includes(error.message) ? error.message : 'COMPOSITION_FAILED' };
  }
}
