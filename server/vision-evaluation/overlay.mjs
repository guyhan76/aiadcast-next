import sharp from 'sharp';
import { sourceHash } from './analysis.mjs';

const axes = ['width', 'depth', 'height'];
const point = p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1);
const box = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] >= 0 && b[1] >= 0 && b[2] > 0 && b[3] > 0 && b[0] + b[2] <= 1 && b[1] + b[3] <= 1;
const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
const contains = (b, p) => p[0] >= b[0] - .025 && p[1] >= b[1] - .025 && p[0] <= b[0] + b[2] + .025 && p[1] <= b[1] + b[3] + .025;

export function validateProposal(p) {
  if (!p || p.located !== true || !box(p.product)) throw Error('PRODUCT_NOT_LOCATED');
  if (!Array.isArray(p.protectedText) || p.protectedText.length > 30 || !p.protectedText.every(box)) throw Error('INVALID_TEXT_REGIONS');
  if (!Array.isArray(p.existingAnnotations) || p.existingAnnotations.length > 20 || !p.existingAnnotations.every(box)) throw Error('INVALID_EXISTING_ANNOTATIONS');
  for (const axis of axes) {
    const edge = p.axes?.[axis];
    if (!Array.isArray(edge) || edge.length !== 2 || !edge.every(point) || !edge.every(pt => contains(p.product, pt)) || Math.hypot(edge[0][0] - edge[1][0], edge[0][1] - edge[1][1]) < .02) throw Error('INVALID_AXIS');
  }
  return p;
}
export function planOverlay(proposal, dimensions, mode, width, height) {
  const p = validateProposal(proposal);
  if (!['main', 'inset'].includes(mode)) throw Error('INVALID_MODE');
  if (!axes.every(a => typeof dimensions?.[a] === 'string' && /^(?:[1-9]\d{0,4}|100000)(?:\.\d{1,4})?$/.test(dimensions[a]) && Number(dimensions[a]) <= 100000)) throw Error('INVALID_SAVED_DIMENSIONS');
  const obstacles = [...p.protectedText];
  let transform = pt => pt, inset = null;
  if (mode === 'inset') {
    if (!box(p.inset) || p.inset[2] < .15 || p.inset[3] < .15 || [...obstacles, p.product].some(b => overlap(p.inset, b))) throw Error('NO_SAFE_INSET_SPACE');
    const scale = Math.min(p.inset[2] / p.product[2], p.inset[3] / p.product[3]);
    const w = p.product[2] * scale, h = p.product[3] * scale;
    inset = [p.inset[0] + (p.inset[2] - w) / 2, p.inset[1] + (p.inset[3] - h) / 2, w, h];
    transform = pt => [inset[0] + (pt[0] - p.product[0]) * scale, inset[1] + (pt[1] - p.product[1]) * scale];
    // The crop reuses exactly this product's pixels; it does not remove background
    // or pre-existing arrows. Preserve source product and existing annotations.
    obstacles.push(p.product, ...p.existingAnnotations);
  }
  const fontSize = Math.max(14, Math.round(Math.min(width, height) * .023));
  const planned = [];
  for (const axis of axes) {
    const [a, b] = p.axes[axis].map(transform);
    const lineBox = [Math.min(a[0], b[0]) - .004, Math.min(a[1], b[1]) - .004, Math.abs(a[0] - b[0]) + .008, Math.abs(a[1] - b[1]) + .008];
    if (!box(lineBox) || obstacles.some(r => overlap(lineBox, r))) throw Error('AXIS_COVERS_COPY');
    const text = `${dimensions[axis]} mm`;
    const tw = (text.length * fontSize * .7 + 16) / width, th = (fontSize * 1.6) / height;
    const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const candidates = [[0, -th], [0, th], [-tw / 2 - .02, 0], [tw / 2 + .02, 0]]
      .map(([x, y]) => [middle[0] + x - tw / 2, middle[1] + y - th / 2, tw, th]);
    const label = candidates.find(r => box(r) && ![...obstacles, ...planned.map(e => e.label)].some(b => overlap(r, b)));
    if (!label) throw Error('NO_SAFE_LABEL_SPACE');
    planned.push({ axis, a, b, label, text });
  }
  return { planned, fontSize, inset, product: p.product, verified: false, containsExistingAnnotations: p.existingAnnotations.length > 0 };
}

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
