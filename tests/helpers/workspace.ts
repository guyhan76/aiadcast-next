import {expect,type Page,type Dialog} from '@playwright/test';

// Attempt reload immediately. If IndexedDB is still committing a large draft,
// verify the real user-facing unload protection, stay, and retry once saved.
export async function reloadDraft(page:Page){
 let protectedReload=false;let stayed!:()=>void;const stayedOnPage=new Promise<void>(resolve=>{stayed=resolve;});
 const stay=async(dialog:Dialog)=>{expect(dialog.type()).toBe('beforeunload');protectedReload=true;await dialog.dismiss();stayed();};
 page.on('dialog',stay);
 try{await Promise.race([page.reload().catch(error=>{if(!protectedReload)throw error;}),stayedOnPage]);}
 finally{page.off('dialog',stay);}
 if(protectedReload){
  const language=await page.locator('html').getAttribute('lang');
  await expect(page.locator('.workspace-save-state')).toHaveText(language==='en'?'Draft saved on this device.':'입력 내용이 기기에 저장되었습니다.');
  await page.reload();
 }
}
