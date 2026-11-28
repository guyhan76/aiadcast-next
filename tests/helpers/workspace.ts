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
  await expect.poll(()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})).toBe(false);
  await page.reload();
 }
}
