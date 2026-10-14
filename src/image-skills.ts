// User-defined creative recipes, grounded in the 160-command guide (pp. 5, 8, 9, 16).
// These expand production intent; they are not provider tools or quality guarantees.
export type ImageSkill={id:string;label:string;aliases:string[];instruction:string};
export const imageSkills:readonly ImageSkill[]=[
 {id:'magazine-cover',label:'잡지 표지',aliases:['magazine-cover'],instruction:'Build an editorial magazine-cover composition around the supplied hero product. Establish a large readable headline, deliberate type hierarchy and material-specific studio lighting. Use only approved company/product names; do not invent a real magazine masthead, issue number, testimonial or price.'},
 {id:'3billboard',label:'3D 빌보드',aliases:['3Billboard'],instruction:'Create ONE still concept mockup of the supplied product appearing to project from a corner LED billboard. Align the display planes, street perspective, lighting and shadows; preserve the product proportions and physical print. This means a protruding billboard illusion, not three billboards. Do not imply an actual installation or invent a location or media booking.'},
 {id:'packaging',label:'패키지 목업',aliases:['packaging'],instruction:'Present the existing reference packaging as a premium realistic mockup. Preserve its opening mechanism, lid/base fit, flap cuts, seams, material layers, printing orientation and named dimension ratios. Do not redesign its structure, invent contents or add new finishes. This is an advertising image, not a manufacturing dieline.'},
 {id:'metaad',label:'소셜 광고',aliases:['metaad'],instruction:'Compose a mobile-readable static social advertisement with one dominant product, one clear message and the supplied offer. Respect the requested canvas ratio and existing safe-margin rules. Include a CTA only when explicitly requested. Do not imply publishing, campaign execution or guaranteed performance.'},
 {id:'showcase',label:'쇼케이스',aliases:['showcase'],instruction:'Stage the supplied product as a gallery-quality hero with a material-appropriate plinth, coherent environment, controlled reflections and precise light. Keep the complete product, its label and silhouette readable. Choose the setting from the product, avoiding a repeated default of marble, silk and gold.'},
 {id:'product-explosion',label:'제품 확산 연출',aliases:['product-explosion','product explosion'],instruction:'Create a dynamic advertising arrangement of the supplied product or its VERIFIED components spreading from a visual center. Keep their exact identities, quantities, printing and proportions. Do not fabricate hidden internals or confuse this with an engineering exploded-view diagram. If components are not documented, retain the intact product and express energy through lighting and background motion.'},
 {id:'adcreative',label:'광고 크리에이티브',aliases:['adcreative'],instruction:'Produce one coherent campaign visual with a clear hierarchy of the real product, approved headline and supplied offer. Make the product large and legible, choose lighting and setting for the intended audience, and integrate visible business contacts cleanly. No invented benefits, badges, discounts or unsolicited CTA.'},
];
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function requestedImageSkills(notes:string):ImageSkill[]{
 const found:{skill:ImageSkill;index:number}[]=[];
 for(const skill of imageSkills){
  const matches=[...notes.matchAll(new RegExp('(?:^|[\\s,;+(])\\/(?:'+skill.aliases.map(escape).join('|')+')(?![a-z0-9_-])','gi'))];
  if(!matches.length)continue;
  const excluded=matches.some(m=>{
   const before=notes.slice(Math.max(0,m.index!-35),m.index).trimEnd();
   const after=notes.slice(m.index!+m[0].length,m.index!+m[0].length+35);
   return /(?:\bno|\bwithout|\bomit|\bexclude|\bremove)\s*$/i.test(before)||/^(?:은|는|을|를|도)?\s*(?:말고|빼|제외|금지|사용하지|넣지|하지|없이)/.test(after);
  });
  if(!excluded)found.push({skill,index:matches[0].index!});
 }
 return found.sort((a,b)=>a.index-b.index).map(x=>x.skill);
}
export function imageSkillBrief(notes:string):string {
 const selected=requestedImageSkills(notes);
 if(!selected.length)return '';
 return '\nREQUESTED IMAGE RECIPES (creative instructions, not external tools):\n'+selected.map(s=>'['+s.id+'] '+s.instruction).join('\n')+'\nApply these requested treatments within ONE finished advertisement. Product identity, supplied dimensions, material construction, exact facts, manual copy, contact visibility and the CTA policy take priority over every styling effect. Keep the established output format. A recipe does not prove the resulting image is accurate; the image must be inspected.';
}
