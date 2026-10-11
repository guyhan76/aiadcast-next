import type {Locale,Project} from './model.ts';
import {requestedCallToAction} from './art-direction.ts';

export type CopyRequest={requestId:string;kind:'suggest'|'translate';sourceLocale:Locale;targetLocale:Locale;productName:string;description:string;cta?:{requested:boolean;text:string};copy:{title:string;description:string}};
export type CopyProposal={requestId:string;kind:'suggest'|'translate';targetLocale:Locale;proposal:{title:string;description:string};review:{required:true;numericChanges:{added:string[];omitted:string[]}}};
export type CopySnapshot={projectId:string;sourceLocale:Locale;targetLocale:Locale;signature:string};

function signature(project:Project,sourceLocale:Locale,targetLocale:Locale){
 return JSON.stringify({id:project.id,locale:project.locale,productName:project.productName,productDetails:project.productProfile.material,requestNote:project.campaign?.creative?.note??'',source:project.copy[sourceLocale],target:project.copy[targetLocale]});
}
export function copySnapshot(project:Project,sourceLocale:Locale,targetLocale:Locale):CopySnapshot {
 return {projectId:project.id,sourceLocale,targetLocale,signature:signature(project,sourceLocale,targetLocale)};
}
export function copySnapshotCurrent(project:Project,snapshot:CopySnapshot){
 return project.id===snapshot.projectId&&signature(project,snapshot.sourceLocale,snapshot.targetLocale)===snapshot.signature;
}
export function makeCopyRequest(project:Project,kind:CopyRequest['kind'],targetLocale:Locale,description='',requestId=crypto.randomUUID()):CopyRequest {
 const source=project.copy[project.locale];
 const action=requestedCallToAction(project.campaign?.creative?.note??'');
 return {requestId,kind,sourceLocale:project.locale,targetLocale,productName:project.productName,description:[project.productProfile.material,description].filter(Boolean).join('\n').slice(0,3000),cta:{requested:!!action,text:action==='requested'?'':action},copy:{title:source.title,description:source.description}};
}
export function parseCopyProposal(raw:unknown,request:CopyRequest):CopyProposal {
 if(!raw||typeof raw!=='object')throw Error('INVALID_COPY_RESPONSE');
 const value=raw as CopyProposal;
 if(value.requestId!==request.requestId||value.kind!==request.kind||value.targetLocale!==request.targetLocale||!value.proposal||typeof value.proposal.title!=='string'||typeof value.proposal.description!=='string'||!value.proposal.title.trim()||value.proposal.title.length>180||value.proposal.description.length>240)throw Error('INVALID_COPY_RESPONSE');
 const changes=value.review?.numericChanges;
 if(!changes||![changes.added,changes.omitted].every(items=>Array.isArray(items)&&items.length<=100&&items.every(item=>typeof item==='string'&&item.length<=100)))throw Error('INVALID_COPY_RESPONSE');
 return {requestId:value.requestId,kind:value.kind,targetLocale:value.targetLocale,proposal:{title:value.proposal.title,description:value.proposal.description},review:{required:true,numericChanges:{added:[...changes.added],omitted:[...changes.omitted]}}};
}
export function applyCopyProposal(project:Project,proposal:CopyProposal,snapshot:CopySnapshot,confirmed:boolean):Project {
 if(!confirmed)throw Error('COPY_REVIEW_REQUIRED');
 if(!copySnapshotCurrent(project,snapshot)||proposal.targetLocale!==snapshot.targetLocale)throw Error('COPY_SOURCE_CHANGED');
 const target=project.copy[proposal.targetLocale];
 // Patches only these two editable copy fields. Contact/brand/website, original
 // assets, dimensions and every other confirmed field stay exactly as saved.
 return {...project,locale:proposal.targetLocale,copy:{...project.copy,[proposal.targetLocale]:{...target,title:proposal.proposal.title,description:proposal.proposal.description}}};
}

