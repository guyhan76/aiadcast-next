import {useEffect,useRef,useState} from 'react';
import {Link2} from 'lucide-react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {useUiLanguage} from './ui-language';

export type ProductImport={title:string;option:string;price:string;shipping:string;description:string;image:string};
type Props={initialUrl:string;disabled:boolean;hasInfo:boolean;photoRoom:boolean;onApply:(value:ProductImport,url:string)=>void};

export function VideoProductImport({initialUrl,disabled,hasInfo,photoRoom,onApply}:Props){
  const {t}=useUiLanguage();
  const [open,setOpen]=useState(false),[url,setUrl]=useState(initialUrl);
  const [product,setProduct]=useState<ProductImport|null>(null),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const current=useRef<AbortController|null>(null),capture=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>current.current?.abort(),[]);
  function reset(){
    current.current?.abort();current.current=null;
    setProduct(null);setMessage('');setBusy(false);
  }
  async function read(file?:File){
    reset();
    let link=url.trim();
    if(!file){
      if(!/^\w+:\/\//.test(link))link='https://'+link;
      try{
        const parsed=new URL(link);
        if(parsed.protocol!=='https:'||!parsed.hostname.includes('.')||parsed.username||parsed.password||parsed.port)throw Error();
      }catch{setMessage(t('상품 페이지의 https 링크를 입력해 주세요.','Enter the HTTPS link to the product page.'));return;}
      setUrl(link);
    }else if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>5_000_000){
      setMessage(t('캡처는 5MB 이하의 JPG, PNG, WebP를 선택해 주세요.','Choose a JPG, PNG or WebP screenshot up to 5 MB.'));return;
    }
    const controller=new AbortController();current.current=controller;setBusy(true);
    try{
      let body:{url:string}|{capture:string}={url:link};
      if(file){
        const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});
        controller.signal.throwIfAborted();body={capture:data};
      }
      const fields=await apiRequest<ProductImport>('/api/product-import',body,AbortSignal.any([controller.signal,AbortSignal.timeout(35_000)]));
      controller.signal.throwIfAborted();
      setProduct(fields);
    }catch(error){
      if(!controller.signal.aborted)setMessage(error instanceof ApiRequestFailure&&error.code==='PRODUCT_IMPORT_BUSY'
        ?t('다른 상품을 읽는 중이에요. 잠시 후 다시 시도해 주세요.','Another import is running. Try again shortly.')
        :file?t('캡처에서 상품 정보를 읽지 못했어요. 상품명과 판매가가 함께 보이도록 캡처하거나 아래에 직접 입력해 주세요.','Capture the product name and selling price together, or fill in the fields below.')
        :t('이 링크에서 정보를 읽지 못했어요. 상품 화면 캡처로 불러오거나 아래에 직접 입력해 주세요.','Could not read this link. Import a screenshot or fill in the fields below.'));
    }finally{if(current.current===controller){current.current=null;setBusy(false);}}
  }
  const labels=[
    ['title',t('광고용 상품명','Ad product name'),100],['option',t('선택 옵션','Selected option'),120],
    ['price',t('판매가','Selling price'),100],['shipping',t('배송 문구','Shipping'),180]
  ] as const;
  return <div className="vd-import">
    <button type="button" className="vd-import-toggle" disabled={disabled} aria-expanded={open} onClick={()=>{reset();setOpen(!open);}}><Link2 size={17}/>{t('상품 링크에서 불러오기','Import from product link')}</button>
    {open&&<fieldset className="vd-brief vd-import-panel" disabled={disabled}>
      <label>{t('상품 링크','Product link')}<input type="url" inputMode="url" maxLength={4096} placeholder="https://…" value={url} onChange={e=>{reset();setUrl(e.target.value);}}/></label>
      <div className="vd-import-actions">
        <button type="button" className="vd-library" disabled={busy||!url.trim()} onClick={()=>void read()}>{t('링크 읽기','Read link')}</button>
        <button type="button" className="vd-library" disabled={busy} onClick={()=>capture.current?.click()}>{t('상품 화면 캡처 첨부','Import screenshot')}</button>
        <input className="vd-file" ref={capture} aria-label={t('상품 화면 캡처 파일','Product screenshot file')} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void read(f);}}/>
      </div>
      {busy&&<small role="status">{t('상품 정보를 읽는 중…','Reading product information…')}</small>}
      {message&&<p role="alert">{message}</p>}
      {product&&<>
        {labels.map(([key,label,limit])=><label key={key}>{label}<input value={product[key]} maxLength={limit} onChange={e=>setProduct({...product,[key]:e.target.value})}/></label>)}
        {product.description&&<label>{t('불러온 설명','Imported description')}<textarea maxLength={1500} value={product.description} onChange={e=>setProduct({...product,description:e.target.value})}/></label>}
        {product.image&&photoRoom?<div className="vd-import-photo"><img src={product.image} alt={t('불러온 상품 사진','Imported product photo')}/><button type="button" className="vd-library" onClick={()=>setProduct({...product,image:''})}>{t('사진 제외','Omit photo')}</button></div>
          :<small>{photoRoom?t('필요한 상품 사진은 광고 소재에서 추가해 주세요.','Add any missing product photo under Ad media.'):t('소재 10개가 있어 상품 정보만 적용해요.','All 10 media slots are in use. Only product details will be applied.')}</small>}
        {hasInfo&&<small>{t('적용하면 상품 정보와 기본 자막·내레이션이 새 상품 기준으로 바뀌어요.','Applying replaces the product details and resets captions and narration to match.')}</small>}
        <button type="button" className="vd-primary" disabled={!product.title.trim()} onClick={()=>{onApply(product,url.trim());setProduct(null);setOpen(false);}}>{t('상품 정보 적용','Apply product details')}</button>
      </>}
    </fieldset>}
  </div>;
}
