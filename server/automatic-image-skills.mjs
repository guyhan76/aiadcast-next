import {imageRecipes, imageSkills, imageSkillBrief} from '../src/image-skills.ts';
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
function suggestedRecipes(request, fallback) {
  const fields = [request.creativeDirection?.additionalInstructions, request.copy?.title, request.productName,
    request.copy?.description, request.productProfile?.material, ...(request.attributes ?? []).map(attribute => attribute.value)];
  // A negated technique must not be recommended as a starting point. The original
  // customer wording (including more complex exclusions) also goes to the renderer.
  const ranked = [], excluded = new Set();
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
export function finishedAdSkillBrief(request) {
  const notes = [request.creativeDirection?.additionalInstructions, request.brief]
    .filter(value => typeof value === 'string').join('\n');
  const explicit = imageSkillBrief(notes);
  if (explicit || request.inputMode === 'text-example') return explicit;
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
    ' Use another catalog treatment if it fits the supplied facts, photos and requested mood better. Catalog:\n' + catalog + '\n';
}
