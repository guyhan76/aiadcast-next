import {imageSkills} from '../src/image-skills.ts';

const techniques = new Map(imageSkills.map(skill=>[skill.id,skill.visualDirection]));
const cameraCues = [
  ['birds-eye', /탑다운|수직.{0,5}(?:촬영|구도)|overhead|top.down/i],
  ['macro', /접사|미세한|질감|봉제선|갈색 무늬|macro|texture|marbling/i],
  ['landscape', /전경|탁 트인|파노라마|wide scenic|panoram/i],
  ['pov', /1인칭|사용자 시점|first.person|point.of.view/i],
  ['closeup', /근접|클로즈업|close.up/i],
];

export function videoVisualDirection(brief) {
  const product=brief.kind==='product';
  const facts=[brief.title,brief.description,brief.highlight??brief.emphasis].filter(Boolean).join('\n');
  const statements=facts.split(/[.!?。\n]+/).filter(line=>!/(금지|제외|않|없이|넣지|\b(?:no|never|without|avoid)\b)/i.test(line));
  const camera=cameraCues.find(([,cue])=>statements.some(line=>cue.test(line)))?.[0]??(product?'closeup':'depth-layers');
  const role=product
    ? 'Product commercial: identify the actual item and show one visible selling point from the description.'
    : 'Service commercial: identify what the customer receives. Show the specified service step and the supported outcome.';
  return [role,'Use the title to identify the subject, the description for the action and sequence, and the emphasis for priorities and exclusions throughout.',
    'Camera technique (use only if compatible with the requested staging): '+techniques.get(camera),
    'Make the opening hook the first visible change in that action. Keep cast, object position and final state consistent with the written brief.'].join(' ');
}
