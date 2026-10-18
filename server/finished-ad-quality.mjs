// Complete-ad path only. These are composition instructions, not a quality verdict.
const scenes = {
 'packaging-material': 'Use the supplied packaging as a clear hero; make the actual material, printing and opening readable. A supported surface or closure close-up may explain construction.',
 'packaging-construction': 'Light the actual carton silhouette and printed face clearly; use a construction detail only when the reference establishes it. Keep the headline separate from optional axis annotations.',
 'beauty-material': 'Build around the actual cosmetic packaging and its documented texture. Shape glass, matte plastic or metal with material-appropriate light. Use a texture detail only if the supplied product establishes that texture; a bottle with cream or liquid ribbons is not a default.',
 'accessory-craft': 'Make the actual bag silhouette and carrying function the focus. A supported seam, handle or hardware detail can communicate craft without changing its construction.',
 'jewelry-light': 'Let the actual setting, cut and metal be the focal point, with controlled small highlights and useful scale. A precise setting detail is more useful than decorative glitter.',
 'fashion-motion': 'Communicate the supplied garment through cut, fabric drape and credible styling or movement. Use a tailoring detail only when visible in the references; preserve anatomy and the actual garment.',
 'appliance-precision': 'Show the actual appliance or device clearly in a relevant use scene or precise studio portrait. A documented control or functional detail can support the headline; invented screens and functions cannot.',
 'travel-experience': 'Lead with the supplied destination or experience and spatial depth. Group only supplied itinerary, dates and inclusions into readable supporting information; do not turn travel into a product bottle campaign.',
 'hotel-architecture': 'Use documented room, architecture or hospitality details to convey the supplied stay. Keep any supplied room type, dates, inclusions and restrictions together; unsupported amenities are not visual decoration.',
 'insurance-everyday': 'Use a calm conceptual planning scene or documented service context with clear reading order. Keep every supplied qualification beside its claim; do not use reassurance graphics that imply guaranteed protection or payouts.',
 'healthcare-listening': 'Center the supplied consultation or service with credible human scale and restrained information design. Documented clinic details may support it; avoid efficacy symbolism, before/after imagery and fabricated medical proof.',
 'mobility-silhouette': 'Shape the actual vehicle with directional light and a credible setting. Keep supplied model, price and financing conditions in an ordered group, with a supported interior or feature detail only when useful.',
 'food-ingredients': 'Make the supplied food or produce appetizing through truthful texture, freshness cues and credible serving scale. Supporting ingredients must be declared; show packaging or portion details only when they clarify the actual offer.',
 'home-spatial': 'Show the supplied furnishing at credible scale in a relevant interior, using material and joint detail only when documented. Preserve the actual geometry instead of exaggerating spaciousness.',
 'industrial-function': 'Prioritize the actual component, mechanism or documented application. Use controlled edge light and a supported connection or assembly detail, keeping technical facts readable without invented exploded internals.',
 'dining-menu': 'Lead with the supplied menu item and credible serving presentation; documented dining atmosphere or preparation can support it. Keep the actual menu name, price and supplied conditions easy to scan.',
 'cafe-ritual': 'Lead with the actual drink or dessert and its visible texture. A documented cup or preparation detail can support the scene; use supplied menu facts without inventing extras.',
};

export function finishedAdQualityBrief(production, ratio) {
 const scene = scenes[production.id] ?? `Center the actual subject using this category direction: ${production.concepts[0]}. Use only documented details that help explain it.`;
 const layout = ['16:9','1.91:1','3:2'].includes(ratio)
  ? 'LANDSCAPE: Compose across the width with a clear relationship between headline and subject. Use short readable support groups; do not squeeze a tall poster or a stack of tiny panels into this canvas.'
  : ratio === '1:1'
   ? 'SQUARE: Give headline and subject a balanced, compact reading order. Reserve support space only for supplied facts; avoid a tall-page layout reduced to microscopic text.'
   : ratio === '9:16'
    ? 'TALL PORTRAIT: Establish a strong top-to-middle reading order inside the platform-safe area specified below. Keep secondary detail subordinate and contacts readable; reserved platform margins are not space for additional copy.'
    : 'PORTRAIT: Use a clear vertical reading order with a dominant headline and subject, followed by only the supporting facts the customer supplied. Do not force three stacked panels.';
 return `FINISHED-AD QUALITY: Make a complete, deliberate campaign rather than a decorated product photograph. Establish one strong headline, a prominent subject and a clear secondary reading level. In manual-copy mode, achieve this hierarchy through typography and placement without adding or rewriting words. In AI-copy mode, derive any headline from supplied facts only.
INDUSTRY SCENE: ${scene}
MATERIAL AND DEPTH: Use plausible directional light, contact shadows, perspective and material-specific reflections to give the actual subject depth. Choose colors and background for this subject and its supplied identity; gold, liquid ribbons, cosmetic jars, dark luxury sets and three-panel layouts are not universal templates. Supporting detail views are optional, must show the SAME documented subject and must explain a real feature; do not invent cross-sections, contents or product variants to fill space.
RATIO AND LEGIBILITY: ${layout} Keep Korean syllable blocks intact, use natural phrase breaks and distinct type sizes, and avoid pseudo-Korean glyphs or decorative English filler. At phone viewing size, the main headline and product/service name must read first; supporting facts and qualifications must remain legible. Reduce ornament and optional detail views before reducing type. Never omit required conditions or add filler to make a page look full. Spacing should connect related information and separate unrelated groups.
QUALITY PRIORITY: These styling instructions never override source identity, mode constraints, exact axes/units, hidden or optional specifications, manual copy, supplied factual limits or the customer's CTA choice. Do not invent brands, prices, discounts, ingredients, certifications, efficacy, returns or coverage. The result still requires human visual review; this brief does not verify model output.`;
}
