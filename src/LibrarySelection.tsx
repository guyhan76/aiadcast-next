import {useRef,useState} from 'react';
import {Trash2} from 'lucide-react';
import {useUiLanguage} from './ui-language';

export function useLibrarySelection(ids:string[],remove:(ids:string[])=>Promise<void>,save?: (ids:string[])=>Promise<string[]>,saveIds:string[]=[],share?:(ids:string[])=>Promise<string[]>){
 const {t}=useUiLanguage(),[editing,setEditing]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 const chosen=ids.filter(id=>selected.has(id));
 const saveChosen=chosen.filter(id=>saveIds.includes(id));
 function close(){setEditing(false);setSelected(new Set());setError('');}
 function toggle(id:string){setSelected(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 async function erase(target:string[]){
  if(lock.current||!target.length)return;
  if(!window.confirm(t('선택한 광고 '+target.length+'건을 내 프로젝트에서 삭제할까요? 이 기기와 서버에 보관된 사본도 함께 삭제됩니다.','Delete '+target.length+' selected ads, including their copies on this device and the server?')))return;
  lock.current=true;setBusy(true);setError('');
  try{await remove(target);close();}catch{setError(t('삭제를 완료하지 못했습니다. 목록을 확인하고 다시 시도해 주세요.','Deletion incomplete. Check the list and retry.'));}finally{lock.current=false;setBusy(false);}
 }
 async function exportItems(target:string[],mode:'save'|'share'){
  const run=mode==='share'?share:save;
  if(!run||lock.current||!target.length)return;
  lock.current=true;setBusy(true);setError('');
  try{
   const remaining=await run(target);
   if(editing){
    if(remaining.length)setSelected(new Set(remaining));
    else close();
   }
  }catch{
   setError(mode==='share'?t('공유를 완료하지 못했습니다. 다시 시도해 주세요.','Could not finish sharing. Please retry.'):t('저장을 완료하지 못했습니다. 다시 시도해 주세요.','Could not finish saving. Please try again.'));
  }finally{lock.current=false;setBusy(false);}
 }
 const saveItems=(target:string[])=>exportItems(target,'save'),shareItems=(target:string[])=>exportItems(target,'share');
 const tools=ids.length>0&&<div className="library-manage" role="group" aria-label={t('광고 관리','Manage ads')}>
  {!editing?<button type="button" disabled={busy} onClick={()=>setEditing(true)}>{t('선택','Select')}</button>:<>
   <button type="button" onClick={()=>setSelected(chosen.length===ids.length?new Set():new Set(ids))} disabled={busy}>{chosen.length===ids.length?t('선택 해제','Deselect all'):t('전체 선택','Select all')}</button>
   {save&&<button type="button" className="save-chosen" disabled={!saveChosen.length||busy} onClick={()=>void saveItems(saveChosen)}>{chosen.length===ids.length?t('전체 저장','Save all'):t('선택 저장','Save selected')}{saveChosen.length?' ('+saveChosen.length+')':''}</button>}
   {share&&<button type="button" disabled={!saveChosen.length||busy} onClick={()=>void shareItems(saveChosen)}>{chosen.length===ids.length?t('전체 공유','Share all'):t('선택 공유','Share selected')}{saveChosen.length?' ('+saveChosen.length+')':''}</button>}
   <button type="button" className="remove-chosen" disabled={!chosen.length||busy} onClick={()=>void erase(chosen)}><Trash2 size={16}/>{chosen.length===ids.length?t('전체 삭제','Delete all'):t('선택 삭제','Delete selected')}{chosen.length?' ('+chosen.length+')':''}</button>
   <button type="button" onClick={close} disabled={busy}>{t('취소','Cancel')}</button></>}
  {error&&<p role="alert">{error}</p>}
 </div>;
 return {editing,busy,error,tools,selected,toggle,erase,saveItems,shareItems};
}
