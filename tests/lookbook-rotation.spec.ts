import {test,expect} from '@playwright/test';

test('lookbook advances in order every three seconds and supports pause, manual selection and resume',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.clock.install();await page.goto('/');
 const gallery=page.locator('.home-showcase');await gallery.scrollIntoViewIfNeeded();await page.mouse.move(0,0);
 await expect(gallery.locator('.campaign-paging > span')).toHaveAttribute('aria-live','off');
 for(const name of ['패션소품','주얼리','패션','여행','호텔','화장품']){await page.clock.runFor(3000);await expect(gallery.getByRole('tab',{name,exact:true})).toHaveAttribute('aria-selected','true');}
 await gallery.getByRole('button',{name:'자동 넘김 일시정지',exact:true}).click();await page.mouse.move(0,0);await page.clock.runFor(9000);await expect(gallery.getByRole('tab',{name:'화장품',exact:true})).toHaveAttribute('aria-selected','true');
 await gallery.getByRole('tab',{name:'여행',exact:true}).click();await page.mouse.move(0,0);await page.clock.runFor(6000);await expect(gallery.getByRole('tab',{name:'여행',exact:true})).toHaveAttribute('aria-selected','true');
 await gallery.getByRole('button',{name:'자동 넘김 시작',exact:true}).click();await page.mouse.move(0,0);await page.clock.runFor(3000);await expect(gallery.getByRole('tab',{name:'호텔',exact:true})).toHaveAttribute('aria-selected','true');
 await page.goto('/#projects');await page.clock.runFor(12000);await expect(gallery.getByRole('tab',{name:'호텔',exact:true,includeHidden:true})).toHaveAttribute('aria-selected','true');
});

test('reduced-motion preference leaves the carousel still until the user starts it',async({page})=>{
 await page.clock.install();await page.goto('/');const gallery=page.locator('.home-showcase');await gallery.scrollIntoViewIfNeeded();await page.mouse.move(0,0);
 await expect(gallery.getByRole('button',{name:'자동 넘김 시작',exact:true})).toBeVisible();await page.clock.runFor(9000);await expect(gallery.getByRole('tab',{name:'화장품',exact:true})).toHaveAttribute('aria-selected','true');
 await gallery.getByRole('button',{name:'자동 넘김 시작',exact:true}).click();await page.mouse.move(0,0);await page.clock.runFor(3000);await expect(gallery.getByRole('tab',{name:'패션소품',exact:true})).toHaveAttribute('aria-selected','true');
});
