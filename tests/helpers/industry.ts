import {expect,type Locator,type Page} from '@playwright/test';
import {industryKindFor,productCategories,type ProductCategory} from '../../src/industry';

/** Select through the customer-facing search in either the wizard or compact editor. */
export async function selectIndustry(page:Page,category:string,container?:Locator){
 const label=productCategories.find(([id])=>id===category)?.[1];
 if(!label)throw Error(`Unknown industry: ${category}`);
 const picker=(container??page.locator('.editor-container:visible')).getByRole('group',{name:'업종 선택',exact:true});
 const toggle=picker.getByRole('button',{name:/업종 변경/});
 if(await toggle.count()&&await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 const kind=industryKindFor(category as ProductCategory);
 const branch=picker.getByRole('button',{name:kind==='product'?'상품':'서비스',exact:true});
 if(await branch.getAttribute('aria-pressed')!=='true')await branch.click();
 await picker.getByRole('searchbox',{name:'업종 찾기',exact:true}).fill(label);
 await picker.getByRole('button',{name:label,exact:true}).click();
 if(await toggle.count())await expect(toggle).toContainText(label);
 else await expect(picker.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
}
