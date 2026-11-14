import type {Project} from './model.ts';
import {dimensionAxes} from './product.ts';
import {validMillimeters} from './dimension-units.ts';
import {boxProjectionActive,boxProjectionReady} from './box-projection.ts';
import {generatedCompatibilityKey,hasUsableCreative} from './generated.ts';

export function dimensionApplication(p:Project) {
 const axes=dimensionAxes(p.productProfile);
 const values=axes.map(axis=>({axis,value:p.dimensions[axis],unit:'mm' as const}));
 const valid=values.length>0&&values.every(v=>validMillimeters(v.value));
 let state: 'none'|'invalid'|'photo-pending'|'projected'|'projection-pending'|'source-retained'|'ai-reference-used'|'outdated'|'ai-reference-pending';
 if(!axes.length)state='none';
 else if(!valid)state='invalid';
 else if(boxProjectionActive(p))state=boxProjectionReady(p)?'projected':'projection-pending';
 else if(p.generation.mode==='original')state=p.product?'source-retained':'photo-pending';
 else if(hasUsableCreative(p))state='ai-reference-used';
 else if(p.generated?.mode==='creative'&&p.generated.specificationKey!==generatedCompatibilityKey(p))state='outdated';
 else state='ai-reference-pending';
 return {state,values,valid,labelsVisible:!!axes.length&&p.dimensions.visible,geometryVerified:false as const,
  ratios:valid?values.map(v=>({axis:v.axis,ratio:Number(v.value)/Number(values[0].value)})):[]};
}
