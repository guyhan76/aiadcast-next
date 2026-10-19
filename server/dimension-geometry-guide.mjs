import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {geometryGuideSvg} from '../src/dimension-geometry.ts';
export async function structuralGuide(contract){
 const svg=geometryGuideSvg(contract);if(!svg)return null;
 const bytes=await sharp(Buffer.from(svg)).png().toBuffer();
 return {bytes,mime:'image/png',sha256:createHash('sha256').update(bytes).digest('hex'),contractHash:createHash('sha256').update(JSON.stringify(contract)).digest('hex'),width:800,height:800,outputGeometryVerified:false};
}
export function geometryBrief(contract){
 if(!contract)return '';
 return `DIMENSION-FIRST CONSTRUCTION: ${JSON.stringify(contract)}. Input physical measurements take precedence over proportions or silhouette in appearance photographs. Reference photographs supply material, print, color, design and documented construction only. Do not retain old photographed aspect ratios when they conflict with the measurements. ${contract.shape==='unresolved'?'SHAPE INFORMATION INCOMPLETE: no rigid geometric guide is available. These extents alone do not determine a silhouette. Do not substitute a cuboid for clothing, a bag, a bottle profile or an irregular object. Do not claim verified precision or invent missing part measurements.':'IMAGE 1 is a deterministic body structural guide computed from physical dimensions BEFORE perspective projection, not an appearance reference or an image to paste into the ad. Subsequent images are appearance references in their original relative order. Build the measured body from this guide before art direction; do not stretch one screen axis to fake physical ratios. The guide excludes flaps, handles, shoulders, necks and caps; it does not authorize inventing those details or replacing a whole bottle with a plain cylinder.'} GEOMETRY AND ANNOTATION ARE SEPARATE: first construct the measured product, then apply only the requested dimension display to that same product. An inset must show the SAME geometry and appearance as the main product. No labels or arrows when display is none. Matching numbers alone never establish geometric correctness. No prompt or model self-check constitutes output verification.`;
}
