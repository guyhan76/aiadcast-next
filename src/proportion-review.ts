import type {Point,Project} from './model.ts';
import {dimensionAxes} from './product.ts';

export type MeasuredPhoto = {
 view:'unconfirmed'|'front'|'perspective';
 // Width endpoints first, then the vertical-axis endpoints. Coordinates are image-relative.
 points:Point[];
};
export type ProportionMeasurement = {source:MeasuredPhoto;result:MeasuredPhoto;sameExtentConfirmed:boolean;extent:string};
export type ReviewImage = {sha256:string;width:number;height:number};
export type ProportionContext = {
 projectId:string;productName:string;category:string;specType:Project['productProfile']['specType'];
 source:ReviewImage;result:ReviewImage;format:string;mode:string;
 specifications:{axis:'width'|'depth'|'height';value:number;unit:'mm'}[];
};
export const PROPORTION_TOLERANCE=.10;
export const emptyMeasurement=():ProportionMeasurement=>({source:{view:'unconfirmed',points:[]},result:{view:'unconfirmed',points:[]},sameExtentConfirmed:false,extent:''});
export function proportionContext(p:Project,result:ReviewImage):ProportionContext {
 if(!p.product)throw Error('SOURCE_REQUIRED');
 return {projectId:p.id,productName:p.productName,category:p.productProfile.category,specType:p.productProfile.specType,
  source:{sha256:p.product.sha256,width:p.product.width,height:p.product.height},result:{sha256:result.sha256,width:result.width,height:result.height},format:p.format,mode:p.generation.mode,
  specifications:dimensionAxes(p.productProfile).map(axis=>({axis,value:Number(p.dimensions[axis]),unit:'mm'}))};
}
type Assessment = {status:'not-applicable'|'unverified'|'invalid'|'mismatch'|'consistent-in-plane';reason:string;ratio:number|null;relativeError:number|null;widthPixels:number|null;verticalPixels:number|null};
const assessment=(status:Assessment['status'],reason:string):Assessment=>({status,reason,ratio:null,relativeError:null,widthPixels:null,verticalPixels:null});
const validImage=(i:ReviewImage)=>/^[a-f0-9]{64}$/.test(i.sha256)&&Number.isInteger(i.width)&&Number.isInteger(i.height)&&i.width>0&&i.height>0&&i.width*i.height<=30_000_000;
const pointValid=(p:Point)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
export function measureFrontRatio(image:ReviewImage,mark:MeasuredPhoto,expected:number|null,extentConfirmed:boolean):Assessment {
 if(expected===null)return assessment('not-applicable','no-dimensions');
 if(!validImage(image)||!Number.isFinite(expected)||expected<=0)return assessment('invalid','invalid-input');
 if(!extentConfirmed)return assessment('unverified','extent-unconfirmed');
 if(mark.view!=='front')return assessment('unverified',mark.view==='perspective'?'perspective-not-measurable':'view-unconfirmed');
 if(mark.points.length!==4)return assessment('unverified','four-points-required');
 if(mark.points.some(p=>!pointValid(p)))return assessment('invalid','invalid-points');
 const [a,b,c,d]=mark.points;
 const wx=(b.x-a.x)*image.width,wy=(b.y-a.y)*image.height,vx=(d.x-c.x)*image.width,vy=(d.y-c.y)*image.height;
 const w=Math.hypot(wx,wy),h=Math.hypot(vx,vy);
 if(w<10||h<10)return assessment('invalid','edges-too-short');
 // Front-view axes must be roughly perpendicular. This cannot detect all perspective distortion.
 if(Math.abs((wx*vx+wy*vy)/(w*h))>Math.sin(Math.PI/12))return assessment('invalid','axes-not-perpendicular');
 const ratio=w/h,relativeError=Math.abs(ratio-expected)/expected;
 return {status:relativeError>PROPORTION_TOLERANCE+1e-12?'mismatch':'consistent-in-plane',reason:'user-marked-front-axes',ratio,relativeError,widthPixels:w,verticalPixels:h};
}
export function buildProportionReport(context:ProportionContext,measurement:ProportionMeasurement,createdAt=new Date().toISOString()) {
 if(!validImage(context.source)||!validImage(context.result))throw Error('INVALID_REVIEW_IMAGE');
 const verticalAxis=context.specType==='flat'?'depth':'height';
 const expectedAxes=context.specType==='none'?[]:context.specType==='flat'?['width','depth']:context.specType==='cylindrical'?['width','height']:['width','depth','height'];
 if(context.specifications.length!==expectedAxes.length||context.specifications.some((s,i)=>s.axis!==expectedAxes[i]||s.unit!=='mm'||!Number.isFinite(s.value)||s.value<=0||s.value>100000))throw Error('INVALID_REVIEW_SPECIFICATIONS');
 if(!Number.isFinite(Date.parse(createdAt))||new Date(createdAt).toISOString()!==createdAt)throw Error('INVALID_REVIEW_TIME');
 const width=context.specifications.find(s=>s.axis==='width')?.value;
 const height=context.specifications.find(s=>s.axis===verticalAxis)?.value;
 const expectedRatio=width&&height?width/height:null;
 const extentConfirmed=measurement.sameExtentConfirmed&&!!measurement.extent.trim();
 const source=measureFrontRatio(context.source,measurement.source,expectedRatio,extentConfirmed);
 const result=measureFrontRatio(context.result,measurement.result,expectedRatio,extentConfirmed);
 const measurable=(a:Assessment)=>a.status==='consistent-in-plane'||a.status==='mismatch';
 const drift=measurable(source)&&measurable(result)?Math.abs(result.ratio!-source.ratio!)/source.ratio!:null;
 // Matching the source alone never passes: both must match the supplied dimensions, too.
 const status:Assessment['status']=expectedRatio===null?'not-applicable':[source,result].some(a=>a.status==='invalid')?'invalid':
  [source,result].some(a=>a.status==='mismatch')||(drift!==null&&drift>PROPORTION_TOLERANCE+1e-12)?'mismatch':
  [source,result].every(a=>a.status==='consistent-in-plane')?'consistent-in-plane':'unverified';
 return {schema:'aiadcast.product-proportion-review.v1',createdAt,
  context:structuredClone(context),measurement:structuredClone(measurement),
  method:'user-marked-front-two-axis-pixel-ratio',tolerance:PROPORTION_TOLERANCE,
  horizontalAxis:context.specType==='cylindrical'?'diameter':'width',verticalAxis,expectedRatio,
  source,result,sourceToResultRelativeChange:drift,status,
  checkedAxes:status==='consistent-in-plane'?[context.specType==='cylindrical'?'diameter':'width',verticalAxis]:[],
  unmeasuredAxes:context.specType==='rectangular'?['depth']:[],
  geometryVerified:false,identityVerified:false,automaticallyDetected:false,externallyCertified:false,
  limitations:['Front view and measurement extent are confirmed by the user, not automatically detected.',
   'A two-axis ratio cannot prove physical size, depth, hidden surfaces, camera calibration or product identity.',
   '10% is a development comparison threshold, not a patent claim or a manufacturing tolerance.',
   'This is a local unsigned record; hashes bind image bytes but do not certify authorship or measurement truth.']};
}
