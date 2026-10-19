import {expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const subjectBytes=await sharp({create:{width:340,height:250,channels:4,background:'#bc8552'}}).png().toBuffer();
export const subjectHash=createHash('sha256').update(subjectBytes).digest('hex');
export async function attachSubjectPhoto(page:Page){
 const form=page.locator('.create-page');
 await form.getByLabel(/^(참조사진 추가|Add reference photos)$/).setInputFiles({name:'actual-subject.png',mimeType:'image/png',buffer:subjectBytes});
 await expect(form.locator('.reference-item')).toHaveCount(1);
}
