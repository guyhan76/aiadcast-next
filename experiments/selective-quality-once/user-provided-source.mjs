// Local preparation only: no provider, DB, storage upload or dispatch authority.
// Approval metadata is operator input, NOT authentication or proof of a server job.
import {validateImage,hashBytes} from '../../server/openai-image-adapter.mjs';
import {prepareSelectiveProviderInput} from '../../server/selective-image-edit.mjs';
export async function prepareUserProvidedSource({bytes,mask,approval,ownerId,model}){
 if(!approval||approval.kind!=='user-provided-export'||approval.ownerId!==ownerId||!ownerId||approval.authorizedForLocalPreparation!==true||!/^libfile_[a-f0-9]{32}$/.test(approval.libraryFileId)||!/^file_[a-f0-9]+$/.test(approval.fileId)||!/^([a-f0-9]{64})$/.test(approval.sha256)||approval.serverArtifactRelation!=='unverified')throw Error('USER_SOURCE_APPROVAL_REQUIRED');
 if(!Buffer.isBuffer(bytes)||bytes.length>10*1024*1024)throw Error('USER_SOURCE_MISMATCH');
 const sourceBytes=Buffer.from(bytes),record=Object.freeze({...approval});
 const metadata=await validateImage(sourceBytes,'image/png',{maximumPixels:8294400});
 if(hashBytes(sourceBytes)!==record.sha256||sourceBytes.length!==record.bytes||metadata.width!==record.width||metadata.height!==record.height)throw Error('USER_SOURCE_MISMATCH');
 const source={...metadata,bytes:sourceBytes};
 const providerInput=await prepareSelectiveProviderInput({model,source,mask});
 const provenance=Object.freeze({kind:'user-provided-export',ownerId,libraryFileId:record.libraryFileId,fileId:record.fileId,sha256:record.sha256,bytes:record.bytes,width:record.width,height:record.height,serverArtifactRelation:'unverified'});
 return Object.freeze({source,providerInput,provenance,preparationHash:hashBytes(Buffer.from(JSON.stringify({provenance,bindingHash:providerInput.bindingHash}))),dispatchAuthorized:false});
}
