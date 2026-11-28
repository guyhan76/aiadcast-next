import https from 'node:https';
import {lookup} from 'node:dns';
import {isIP} from 'node:net';
import ipaddr from 'ipaddr.js';
import {Parser} from 'htmlparser2';
import sharp from 'sharp';

export function productUrl(raw,base) {
  if(typeof raw!=='string'||!raw.trim()||raw.length>4096)throw Error('INVALID_PRODUCT_URL');
  const url=new URL(raw,base);
  if(url.protocol!=='https:'||url.username||url.password||url.port||isIP(url.hostname)||!url.hostname.includes('.')||url.hostname.includes(':'))throw Error('INVALID_PRODUCT_URL');
  url.hash='';
  return url;
}

// Resolve inside the TLS connection and pin the selected public address for this hop.
function publicLookup(host,options,callback) {
  lookup(host,{family:4,all:true},(error,records)=>{
    if(error||!records.length||records.some(r=>ipaddr.parse(r.address).range()!=='unicast')){
      callback(Error('PRODUCT_PAGE_UNAVAILABLE'));return;
    }
    if(options.all)callback(null,records);else callback(null,records[0].address,4);
  });
}
async function download(url,accept,limit,signal) {
  for(let redirects=0;redirects<=3;redirects++){
    const response=await new Promise((resolve,reject)=>{
      https.get(url,{signal,agent:false,family:4,lookup:publicLookup,headers:{Accept:accept,'User-Agent':'aiadcast/1.0 (product preview)'}},resolve).once('error',reject);
    });
    try {
      if([301,302,303,307,308].includes(response.statusCode)){
        url=productUrl(response.headers.location,url);continue;
      }
      const type=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
      if(response.statusCode!==200||!accept.split(',').includes(type)||Number(response.headers['content-length'])>limit)throw Error('PRODUCT_PAGE_UNAVAILABLE');
      const chunks=[];let size=0;
      for await(const chunk of response){
        size+=chunk.length;if(size>limit)throw Error('PRODUCT_PAGE_UNAVAILABLE');
        chunks.push(chunk);
      }
      return {url,bytes:Buffer.concat(chunks),header:response.headers['content-type']};
    }finally{response.destroy();}
  }
  throw Error('PRODUCT_PAGE_UNAVAILABLE');
}
const plain=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
function priceLabel(amount,currency) {
  if(typeof amount!=='number'&&typeof amount!=='string')return '';
  const numeric=String(amount).trim();
  if(!/^\d{1,12}(?:\.\d{1,4})?$/.test(numeric)||!/^([A-Z]{3})$/.test(currency??''))return '';
  const value=Number(numeric).toLocaleString('en-US',{maximumFractionDigits:4});
  return currency==='KRW'?value+'원':value+' '+currency;
}
const isType=(obj,type)=>[obj?.['@type']].flat().some(s=>typeof s==='string'&&s.split('/').pop()===type);
function sameListing(value,base){
  try{const url=productUrl(value,base);if(url.origin!==base.origin||url.pathname!==base.pathname)return false;
    for(const [key,id] of base.searchParams)if(!/^(q|searchId|sourceType|rank|itemsCount|searchRank|traceId|utm_.*)$/i.test(key)&&url.searchParams.get(key)!==id)return false;
    return true;
  }catch{return false;}
}
function incompatibleOption(value,page) {
  if(!value)return false;
  try{
    const target=productUrl(value,page);
    return [...page.searchParams].some(([key,selected])=>target.searchParams.has(key)&&
      /^(?:itemId|vendorItemId|variant|sku|optionId)$/i.test(key)&&target.searchParams.get(key)!==selected);
  }catch{return true;}
}
function shippingLabel(offer){
  const details=[offer?.shippingDetails].flat().filter(Boolean);
  if(details.length!==1)return '';
  const info=details[0],rate=info.shippingRate;
  if(!isType(info,'OfferShippingDetails')||!rate||info.doesNotShip||info.shippingDestination||info.eligibleTransactionVolume||
     Object.keys(rate).some(key=>!['@type','value','currency'].includes(key)))return '';
  return rate.currency==='KRW'&&/^(0|0\.0+)$/.test(String(rate.value))?'무료배송':'';
}
export function parseProductPage(html,url) {
  const meta=new Map(), products=[];
  let script=null;
  function collect(item,depth=0){
    if(!item||typeof item!=='object'||depth>16)return;
    if(Array.isArray(item)){item.forEach(v=>collect(v,depth+1));return;}
    if(isType(item,'Product'))products.push(item);
    for(const key of ['@graph','mainEntity','hasVariant'])collect(item[key],depth+1);
  }
  new Parser({
    onopentag(name,attrs){
      if(name==='meta'&&attrs.content){const key=(attrs.property||attrs.name||'').toLowerCase();if(!meta.has(key))meta.set(key,attrs.content);}
      if(name==='script'&&attrs.type?.toLowerCase().split(';')[0].trim()==='application/ld+json')script='';
    },
    ontext(value){if(script!==null)script+=value;},
    onclosetag(name){if(name==='script'&&script!==null){try{collect(JSON.parse(script));}catch{}script=null;}}
  }).end(html);
  const matches=products.filter(p=>sameListing(p.url,url));
  const product=products.length===1&&!incompatibleOption(products[0].url,url)?products[0]:matches.length===1?matches[0]:undefined;
  const ogProduct=/^(product|product\.item|og:product)$/i.test(meta.get('og:type')||'')||meta.has('product:price:amount');
  if(!product&&(!ogProduct||products.length))throw Error('PRODUCT_PAGE_UNAVAILABLE');
  const title=plain(product?.name||meta.get('og:title')).slice(0,100);
  if(!title)throw Error('PRODUCT_PAGE_UNAVAILABLE');
  const offers=[product?.offers].flat().filter(o=>o&&isType(o,'Offer'));
  const offerMatches=offers.filter(o=>sameListing(o.url,url));
  const offer=offers.length===1&&!incompatibleOption(offers[0].url,url)?offers[0]:offerMatches.length===1?offerMatches[0]:undefined;
  const price=offer?priceLabel(offer.price,offer.priceCurrency):!product?.offers?priceLabel(meta.get('product:price:amount'),meta.get('product:price:currency')):'';
  const option=[product?.color,product?.size].map(plain).filter(Boolean).join(' · ');
  const img=[product?.image].flat()[0];
  const photo=typeof img==='string'?img:img?.contentUrl||img?.url||meta.get('og:image');
  const descriptions=[];
  new Parser({ontext(value){descriptions.push(value);}}).end(plain(product?.description||meta.get('og:description')));
  return {title,option:option.slice(0,120),price,shipping:shippingLabel(offer),description:plain(descriptions.join(' ')).slice(0,1500),photo};
}
export async function importProductLink(raw) {
  const url=productUrl(raw);
  const signal=AbortSignal.timeout(10000);
  const page=await download(url,'text/html,application/xhtml+xml',2_000_000,signal);
  const charset=/charset\s*=\s*["']?([a-z0-9_-]+)/i.exec(page.header+' '+page.bytes.subarray(0,1500).toString('ascii'))?.[1]||'utf-8';
  const {photo,...fields}=parseProductPage(new TextDecoder(charset).decode(page.bytes),page.url);
  let image='';
  if(photo)try{
    const file=await download(productUrl(photo,page.url),'image/jpeg,image/png,image/webp',5_000_000,signal);
    const pipeline=sharp(file.bytes,{limitInputPixels:25_000_000});
    if(['jpeg','png','webp'].includes((await pipeline.metadata()).format)){
      const jpeg=await pipeline.rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).flatten({background:'white'}).jpeg({quality:88}).toBuffer();
      image='data:image/jpeg;base64,'+jpeg.toString('base64');
    }
  }catch{/* The seller can still review the listing and attach the photo. */}
  return {...fields,image};
}
