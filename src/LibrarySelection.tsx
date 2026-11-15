import {useRef,useState} from 'react';
import {Trash2} from 'lucide-react';
import {useUiLanguage} from './ui-language';

export function useLibrarySelection(ids:string[],remove:(ids:string[])=>Promise<void>,location:'device'|'downloads'){
 const {t}=useUiLanguage(),[editing,setEditing]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 const chosen=ids.filter(id=>selected.has(id));
 function close(){setEditing(false);setSelected(new Set());setError('');}
 function toggle(id:string){setSelected(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 async function erase(target:string[]){
  if(lock.current||!target.length)return;
  const where=location==='device'?t('이 기기의 저장한 광고','the saved ads on this device'):t('서버 다운로드 보관함','your server downloads');
  if(!window.confirm(t(where+'에서 '+target.length+'건을 삭제할까요? 삭제 후 복구할 수 없습니다.','Delete '+target.length+' from '+where+'? This cannot be undone.')))return;
  lock.current=true;setBusy(true);setError('');
  try{await remove(target);close();}catch{setError(t('삭제를 완료하지 못했습니다. 목록을 확인하고 다시 시도해 주세요.','Deletion incomplete. Check the list and retry.'));}finally{lock.current=false;setBusy(false);}
 }
 const tools=ids.length>0&&<div className="library-manage" role="group" aria-label={t('광고 관리','Manage ads')}>
  {!editing?<button type="button" disabled={busy} onClick={()=>setEditing(true)}>{t('선택','Select')}</button>:<>
   <button type="button" onClick={()=>setSelected(chosen.length===ids.length?new Set():new Set(ids))} disabled={busy}>{chosen.length===ids.length?t('선택 해제','Deselect all'):t('전체 선택','Select all')}</button>
   <button type="button" className="remove-chosen" disabled={!chosen.length||busy} onClick={()=>void erase(chosen)}><Trash2 size={16}/>{chosen.length===ids.length?t('전체 삭제','Delete all'):t('선택 삭제','Delete selected')}{chosen.length?' ('+chosen.length+')':''}</button>
   <button type="button" onClick={close} disabled={busy}>{t('취소','Cancel')}</button></>}
  {error&&<p role="alert">{error}</p>}
 </div>;
 return {editing,busy,tools,selected,toggle,erase};
}
