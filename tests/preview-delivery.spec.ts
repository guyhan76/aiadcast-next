import {test,expect} from '@playwright/test';
import {protectedScreen,mockSession} from './helpers/authenticated-session';

test('category menus separate products and services and keep every image count',async({page})=>{
  await protectedScreen(page,mockSession('preview-release'));
  await page.addInitScript(()=>localStorage.setItem('aiadcast.ui-language','ko'));
  await page.goto('/#create');
  const form=page.locator('.consumer-create');
  const picker=form.locator('.ad-field-picker');
  await expect(picker.getByRole('searchbox')).toHaveCount(0);
  const products=picker.getByRole('button',{name:'상품',exact:true});
  const services=picker.getByRole('button',{name:'서비스',exact:true});
  await products.click();
  await expect(products).toHaveAttribute('aria-pressed','true');
  const fields=picker.getByLabel('분야',{exact:true}), items=picker.getByLabel('세부 업종',{exact:true});
  await fields.selectOption('fashion');
  await items.selectOption('shoes');
  await expect(items).toHaveValue('shoes');
  await services.click();
  await expect(services).toHaveCSS('color','rgb(255, 255, 255)');
  const contrast=await services.evaluate(button=>{
    const style=getComputedStyle(button);
    const luminance=(color:string)=>{
      const channels=(color.match(/\d+/g)??[]).slice(0,3).map(value=>{
        const channel=Number(value)/255;
        return channel<=0.04045 ? channel/12.92 : ((channel+0.055)/1.055)**2.4;
      });
      return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];
    };
    const fg=luminance(style.color), bg=luminance(style.backgroundColor);
    return (Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await expect(products).toHaveAttribute('aria-pressed','false');
  await expect(fields.locator('option[value="fashion"]')).toHaveCount(0);
  for(const [field,item] of [['lease-rental','auto-lease'],['logistics','parcel'],['brand-pr','brand-story']]){
    await fields.selectOption(field);
    await items.selectOption(item);
    await expect(items).toHaveValue(item);
  }
  const section=form.locator('[data-order="9"]');
  await expect(section.getByRole('heading',{name:/생성 장수/})).toBeVisible();
  for(const n of [1,2,4,6,8,10]){
    const option=section.getByRole('button',{name:String(n),exact:true});
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed','true');
    await expect(section.getByRole('button',{pressed:true})).toHaveCount(1);
  }
});
