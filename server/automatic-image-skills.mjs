import {imageRecipes, imageSkills, imageSkillBrief, requestedImageSkills} from '../src/image-skills.ts';
import {industryGroups} from '../src/industry.ts';

// The image model sees the customer's fields AND the actual reference pixels in
// this call. Short, grouped names leave room for the customer's copy and do not
// require a planning-model call or a second image generation.
const presetById = new Map(imageSkills.map(skill => [skill.id, skill]));
const legacyGroups = { '3billboard': 'advertising', metaad: 'advertising',
  adcreative: 'advertising', packaging: 'commerce', showcase: 'commerce' };
const meanings = {
  '3billboard': 'corner LED illusion', metaad: 'mobile social ad', adcreative: 'campaign hero',
  packaging: 'faithful packaging mockup', showcase: 'gallery product hero',
  'product-explosion': 'intact product or verified parts in motion',
  'packaging-mockup': 'existing packaging in context', thermograph: 'thermal visualization',
  'practical-light': 'practical light sources', 'ugc-portrait': 'user-style photography', clay: 'clay render',
};
const families = new Map();
for (const recipe of imageRecipes) {
  const group = presetById.get(recipe.id)?.groupId ?? legacyGroups[recipe.id];
  if (!group) throw new Error('Ungrouped image recipe: ' + recipe.id);
  if (!families.has(group)) families.set(group, []);
  families.get(group).push(recipe);
}
const catalog = [...families].map(([group, recipes]) => group + ': ' + recipes.map(recipe =>
  meanings[recipe.id] ? recipe.id + ' (' + meanings[recipe.id] + ')' : recipe.id
).join(', ')).join('\n');

const packing = industryGroups.find(group => group.id === 'packaging').categoryIds;
const byId = new Map(imageRecipes.map(recipe => [recipe.id, recipe]));
function startingPoint(request, hasSubject) {
  const category = request.productProfile?.category;
  if (request.subjectType === 'service') return hasSubject ? 'editorial-spread' : 'minimal-poster';
  if (packing.includes(category)) return 'packaging';
  if (['jewelry', 'beauty', 'accessories'].includes(category)) return 'premium-product';
  if (['food', 'home'].includes(category)) return 'lifestyle-product';
  return 'studio-product';
}
// Match ordinary Korean/English descriptions as well as the catalog labels.
// The renderer can choose another entry after reconciling the actual photographs.
const cues = {
  anime: ['2D 애니메이션', '2D 캐릭터', '2D 일러스트', '2D animation', '2D character'],
  clay: ['3D 애니메이션', '3D 캐릭터', '3D 만화', '3D character', '3D animation'],
  'studio-product': ['제품만', '신발만', '단독 컷', 'product only', 'shoes only'],
  'natural-window-light': ['자연광', '창가 빛', '햇살', 'window light', 'natural light'],
  'minimal-white': ['흰 배경', '하얀 배경', '흰색 배경', 'white background'],
  macro: ['접사', '질감 확대', 'close detail'],
  'event-poster': ['수강생 모집', '행사 안내', '참가자 모집', 'open registration'],
  infographic: ['도표로', '한눈에 비교', '단계별 설명', 'step by step'],
  'dusk-sunset': ['노을', '해질녘', 'sunset'],
  packaging: ['포장 구조', '상자 구조', 'packaging construction'],
};
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = imageRecipes.map(recipe => {
  const preset = presetById.get(recipe.id);
  const terms = new Set([recipe.label, preset?.label, recipe.id, recipe.id.replaceAll('-', ' '), ...(cues[recipe.id] ?? [])].filter(Boolean));
  const pattern = [...terms].sort((a, b) => b.length - a.length).map(term => {
    const phrase = term.split(/\s+/).map(escapePattern).join('\\s*');
    return /^[a-z0-9]/i.test(term) ? '(?<![a-z0-9])' + phrase + '(?![a-z0-9])' : phrase;
  }).join('|');
  return {recipe, group: preset?.groupId ?? legacyGroups[recipe.id], pattern: new RegExp(pattern, 'gi')};
});
function suggestedRecipes(request, fallback, excluded = new Set()) {
  const fields = [request.creativeDirection?.additionalInstructions, request.copy?.title, request.productName,
    request.copy?.description, request.productProfile?.material, request.brief, ...(request.attributes ?? []).map(attribute => attribute.value)];
  // A negated technique must not be recommended as a starting point. The original
  // customer wording (including more complex exclusions) also goes to the renderer.
  const ranked = [];
  for (const {recipe, group, pattern} of words) {
    let score = 0;
    for (const [index, field] of fields.entries()) {
      if (typeof field !== 'string') continue;
      for (const hit of field.matchAll(pattern)) {
        const before = field.slice(0, hit.index).replace(/\/$/, '').trimEnd(), after = field.slice(hit.index + hit[0].length);
        if (/(?:\bno|\bwithout|\bavoid|\bomit|\bexclude)\s*$/i.test(before) ||
            /^(?:은|는|을|를|도)?\s*(?:말고|빼|제외|금지|사용하지|넣지|하지|없이)/.test(after)) excluded.add(recipe.id);
        else score = Math.max(score, (index === 0 ? 30 : index < 3 ? 20 : 10) + Math.min(hit[0].length, 9));
      }
    }
    if (score && !excluded.has(recipe.id)) ranked.push({recipe, group, score});
  }
  ranked.sort((a, b) => b.score - a.score);
  const groups = new Set(), result = [];
  for (const candidate of ranked) {
    if (groups.has(candidate.group)) continue;
    result.push(candidate.recipe); groups.add(candidate.group);
    if (result.length === 3) break;
  }
  if (!result.length && !excluded.has(fallback.id)) result.push(fallback);
  return result;
}
// Plan the set before reserving its jobs. A plan is deterministic for a customer
// snapshot and is stored with the individual job, including its actual recipe.
const roles = {
  hero: ['adcreative', 'Make the representative campaign cover. Show the complete advertised subject, the approved headline and the customer’s main selling point in one immediately readable composition.'],
  offer: ['minimal-poster', 'Let the supplied offer and its exact qualifying terms share the focal area with the subject. Keep terms attached to the amount.'],
  surface: ['closeup', 'Feature a well-documented visible detail, finish or texture in a close composition. Keep the identity legible and never reconstruct a hidden side.'],
  identity: ['packshot', 'Use a clear, isolated view of the complete documented silhouette, with copy arranged around its outline.'],
  reference: ['editorial-spread', 'Use a supplied subject photograph as the leading visual evidence; frame one documented aspect with the approved copy alongside.'],
  meaning: ['abstract-geometry', 'Express the actual service or its supplied purpose with one simple visual metaphor and a headline. Use verified photos only for documentary depictions.'],
  information: ['brochure', 'Group the supplied service details or product specifications into a readable editorial column beside one focal visual. Only use information approved for display.'],
  title: ['magazine-cover', 'Use the approved title as the dominant shape of a cover, aligned closely with one subject visual.'],
  space: ['minimal-poster', 'Put the subject off-center and use intentional negative space to carry the approved message.'],
  light: ['studio-key-fill', 'Build the composition around the boundary between light and shade on the subject, or on a service graphic. Keep all requested background and brand colors.'],
  diagonal: ['adcreative', 'Arrange the subject and the approved headline along a diagonal visual path. Keep the actual subject geometry and upright text.'],
  frame: ['editorial-spread', 'Use an image-led inset framed by the page color, with the approved copy in a compact adjoining block.'],
  band: ['catalog', 'Use one generous subject panel and one narrow horizontal copy band. Do not add other items or variants.'],
  masthead: ['minimal-poster', 'Build an upper masthead from the approved headline, then give the subject a full-width lower field. Keep the subject complete wherever its silhouette is required.'],
  silhouette: ['minimalist-line', 'Let the real outline of the product or a graphic representing the service guide the outer alignment of the approved copy. Keep actual product pixels photographic in treatment when requested.'],
};
const accentColors = ['navy', 'sage', 'burgundy', 'ochre', 'teal', 'violet', 'slate', 'terracotta', 'indigo', 'olive'];
const fixedLayout = /(?:같은|똑같은|동일한?)\s*(?:구도|레이아웃|배치|디자인)|(?:구도|레이아웃|배치|디자인)(?:만|는|은|를|을)?\s*(?:같게|동일|고정|유지|그대로)|(?:same|identical|fixed)\s+(?:composition|layout|framing)|(?:keep|preserve)\s+(?:the\s+)?(?:composition|layout|framing)/i;
const colorOnly = /(?:색상|색깔|컬러|색)(?:만|으로만)\s*(?:바꿔|바꾸|다르|다른|다르게|변경|변화|변주|달리|교체|조정|수정)|(?:only\s+(?:(?:change|vary|the)\s+)*(?:colou?rs?|palette)|(?:colou?rs?|palette)\s+only)/i;
const otherOnly = /(?:문구|카피|배경|제목|헤드라인|조명|글꼴)(?:만|만을)\s*(?:바꿔|바꾸|다르|다른|다르게|변경|변화|변주|달리|교체|조정|수정)|only\s+(?:change|vary)\s+(?:the\s+)?(?:copy|headline|background|lighting|font)/i;

export function planAdBatch(request, count) {
  if (count === 1) return [request];
  const notes = [request.creativeDirection?.additionalInstructions, request.brief].filter(Boolean).join('\n');
  const service = request.subjectType === 'service';
  const photos = [request.source, ...(request.references ?? [])].filter(photo => photo && photo.purpose !== 'style');
  const excluded = new Set();
  const matched = suggestedRecipes(request, byId.get(startingPoint(request, photos.length > 0)), excluded);
  const explicit = requestedImageSkills(notes).filter(recipe => !excluded.has(recipe.id));
  // An expressly named rendering medium carries across every composition.
  const sharedMedium = matched.find(recipe => {
    if (presetById.get(recipe.id)?.groupId !== 'style' && recipe.id !== 'clay') return false;
    const entry = words.find(candidate => candidate.recipe === recipe);
    return entry && notes.match(entry.pattern);
  });
  const approvedText = [request.copy?.title, request.copy?.description, request.copy?.price, request.copy?.offer].filter(Boolean).join(' ');
  const hasOffer = /(?:\d[\d,.]*\s*(?:원|%|KRW|USD)|[$₩]\s*\d|무료|\bfree\b)/i.test(approvedText);
  const hasInfo = Boolean(request.copy?.description || request.specifications?.length);
  const priority = ['hero'];
  if (hasOffer && request.creativeDirection?.direction?.id === 'offer') priority.push('offer');
  if (service) priority.push(photos.length ? 'reference' : 'meaning', ...(hasInfo ? ['information'] : []), 'title');
  else priority.push('surface', 'identity', ...(photos.length > 1 ? ['reference'] : []));
  if (hasOffer) priority.push('offer');
  if (hasInfo) priority.push('information');
  priority.push('space', 'title', 'light', 'diagonal', 'frame', 'band', 'silhouette', 'masthead');
  const sequence = [...new Set(priority)].filter(role => role === 'hero' || !excluded.has(roles[role][0]));
  const palette = colorOnly.test(notes);
  const locked = palette || fixedLayout.test(notes) || otherOnly.test(notes);
  // When many treatments are explicitly excluded, reuse a compatible layout.
  const alternatives = sequence.slice(1);
  return Array.from({length:count}, (_, i) => {
    const role = locked || i === 0 || !alternatives.length ? 'hero' : alternatives[(i-1) % alternatives.length];
    const [roleRecipe, composition] = roles[role];
    const preferred = explicit[0] ?? sharedMedium ?? (role === 'hero' ? matched[0] : undefined);
    const primary = preferred ?? [roleRecipe, 'adcreative', 'minimal-poster'].map(id => byId.get(id)).find(recipe => !excluded.has(recipe.id)) ?? matched[0];
    let direction = composition;
    if (locked) {
      direction = 'Use the same supplied layout and reference framing for every version. In the absence of a specified layout, center the focal subject in the middle zone, place the headline in the upper zone and approved secondary copy below. Use identical scale, alignment, margins and type hierarchy across the set. Vary only what the customer permits.';
      if (palette) direction += ' Use the requested color for this position when the customer specifies a palette or sequence. Otherwise a candidate accent is ' + accentColors[i] + ', only on an unlocked graphic element. Do not recolor a real product, brand mark or a specified background unless the customer requests it.';
    }
    return {...request, batchDirection:{position:i+1, count, role, locked, primary:primary?.id ?? null, direction}};
  });
}
function slotBrief(slot) {
  if (!slot) return '';
  const primary = byId.get(slot.primary);
  return '\nCAMPAIGN SET ART DIRECTION (internal; do not print slot numbers or recipe names): Render only image ' + slot.position + ' of ' + slot.count + '. ' +
    slot.direction + (primary ? ' Assigned primary treatment: [' + primary.id + '] ' + primary.instruction : '') +
    ' Apply the shared customer brief, approved copy, photos, identity, exclusions and placement constraints in full. Any customer-specified order, style or limit overrides these defaults; follow the instruction for this position. Coordinate the palette and typography across this campaign. Only combine compatible techniques. Do not introduce a person, prop, setting, offer or claim just to create variety.\n';
}

export function finishedAdSkillBrief(request) {
  const notes = [request.creativeDirection?.additionalInstructions, request.brief]
    .filter(value => typeof value === 'string').join('\n');
  const explicit = imageSkillBrief(notes);
  if (explicit || request.inputMode === 'text-example') return explicit + slotBrief(request.batchDirection);
  const photos = [request.source, ...(request.references ?? [])].filter(Boolean);
  const hasSubject = photos.some(photo => photo.purpose !== 'style');
  const fallback = byId.get(startingPoint(request, hasSubject));
  const suggestions = suggestedRecipes(request, fallback);
  return '\nAUTOMATIC IMAGE ART DIRECTION (internal; never print these names): ' +
    'Privately compare suitable alternatives from the catalog below. Pick ONE primary treatment and only if useful up to TWO compatible accents. Render that decision in this single ad. ' +
    'Base the choice on the specific advertised subject, field, title, product or service description, additional instructions, approved copy and intended format. Read the actual supplied images before choosing. A subject photo establishes identity and geometry; a style reference suggests lighting, palette or composition only. ' +
    'Customer requests and exclusions are binding, including plain language and negated slash names. For a photographed product keep the real scale, shape, material, markings and their exact visible side; if asked for product alone, show no person or body parts. When a service lacks subject photos use a conceptual treatment that cannot be mistaken for its actual staff, premises or outcomes. ' +
    'For an illustrated education, recruitment or event brief, consider an original cel-shaded 2D or softly rendered 3D character when it explains the service. Explicit 2D/3D style choices override the automatic look. A 3D character can have smooth materials without a clay texture. Do not replace real photographed products, present a character as real staff, or add a character when the customer excludes people or wants documentary realism. Deliver one still poster. Never infer dimensions, internals, before/after results or factual claims from a treatment. Locked copy, placement, language and CTA rules take priority. If a treatment needs undocumented details, pick another. ' +
    'Consider these matched directions first: ' + suggestions.map(recipe => '[' + recipe.id + '] ' + recipe.instruction).join(' ') +
    ' Use another catalog treatment if it fits the supplied facts, photos and requested mood better. Catalog:\n' + catalog + '\n' + slotBrief(request.batchDirection);
}
