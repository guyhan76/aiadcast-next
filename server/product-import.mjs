import {ApiFailure} from './generation-service.mjs';
import {importProductLink} from './product-link.mjs';
import {importProductCapture} from './product-capture.mjs';

export async function readProductImport(body){
  if(typeof body?.url==='string'&&body.url.length<=4096&&body.capture===undefined){
    try{return await importProductLink(body.url);}
    catch{throw new ApiFailure('PRODUCT_PAGE_UNAVAILABLE',422);}
  }
  if(typeof body?.capture==='string'&&body.url===undefined){
    try{return await importProductCapture(body.capture);}
    catch{throw new ApiFailure('PRODUCT_CAPTURE_UNREADABLE',422);}
  }
  throw new ApiFailure('INVALID_PRODUCT_IMPORT',400);
}
