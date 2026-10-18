import {useEffect,useRef,useState} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';

// GET-only lifecycle: coalesce clicks, bound waiting and discard old page responses.
export function useAdminRead<T>(accept:(value:T)=>void,valid:(value:T)=>boolean){
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[confirmedAt,setConfirmedAt]=useState<number|null>(null),[unchanged,setUnchanged]=useState(false);
 const alive=useRef(false),current=useRef<{controller:AbortController;work:Promise<boolean>}|null>(null),last=useRef<string|null>(null),callbacks=useRef({accept,valid});callbacks.current={accept,valid};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;current.current?.controller.abort();current.current=null;};},[]);
 function read(path:string):Promise<boolean>{
  if(!alive.current)return Promise.resolve(false);
  if(current.current)return current.current.work;
  const controller=new AbortController();let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},15000);
  const request={controller,work:Promise.resolve(false)};current.current=request;setPending(true);setError('');
  request.work=(async()=>{
   try{
    const value=await apiRequest<T>(path,undefined,controller.signal);
    if(!alive.current||current.current!==request)return false;
    if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    if(!callbacks.current.valid(value))throw Error('INVALID_STATUS');
    const serialized=JSON.stringify(value);setUnchanged(last.current===serialized);last.current=serialized;
    callbacks.current.accept(value);setConfirmedAt(Date.now());return true;
   }catch(e){
    if(alive.current&&current.current===request)setError(timedOut?'15초 안에 응답을 받지 못했습니다. 다시 조회해주세요.':e instanceof ApiRequestFailure&&(e.status===401||e.status===403)?'관리자 로그인을 확인한 뒤 다시 조회해주세요.':'상태 조회에 실패했습니다. 다시 조회해주세요.');
    return false;
   }finally{clearTimeout(timer);if(current.current===request){current.current=null;if(alive.current)setPending(false);}}
  })();return request.work;
 }
 return {read,pending,error,confirmedAt,unchanged,isPending:()=>current.current!==null};
}
