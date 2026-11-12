import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultPrecision,parsePrecision,textLayers,stickerChoices} from '../src/precision.ts';

test('legacy projects receive independent default layers',()=>{
 const old=parsePrecision(undefined),fresh=defaultPrecision();
 assert.deepEqual(old,fresh);
 old.text.title.scale=1.25;
 assert.equal(old.text.brand.scale,1);
 assert.equal(fresh.text.title.scale,1);
});

test('bounded adjustments survive validation without dropping unrelated fields',()=>{
 const settings=defaultPrecision();
 settings.text.title={x:.1,y:-.1,scale:1.3,font:'serif'};
 settings.background={x:-.5,y:.5,zoom:2,opacity:0};
 settings.sticker={glyph:'✨',x:.1,y:.9,size:160};
 settings.motion='swoosh';
 assert.deepEqual(parsePrecision(settings),settings);
 assert.equal(textLayers.length,5);
 assert.ok(stickerChoices.includes(settings.sticker.glyph));
});

test('malformed settings cannot be imported as render instructions',()=>{
 const base=defaultPrecision();
 for(const invalid of [
  {...base,text:{...base.text,title:{...base.text.title,x:NaN}}},
  {...base,text:{...base.text,title:{...base.text.title,font:'url(evil)'}}},
  {...base,background:{...base.background,zoom:3}},
  {...base,background:{...base.background,opacity:-.1}},
  {...base,sticker:{...base.sticker,glyph:'anything'}},
  {...base,motion:'video'},
  null,
 ])assert.throws(()=>parsePrecision(invalid));
});
