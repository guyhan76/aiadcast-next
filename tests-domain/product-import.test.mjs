import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProductPage,productUrl} from '../server/product-link.mjs';
import {extractCaptureFields} from '../server/product-capture.mjs';

const page=productUrl('https://shop.example/coat?itemId=1');
const markup=product=>'<script type="application/ld+json">'+JSON.stringify(product)+'</script>';
const item={'@type':'Product',name:'겨울 코트',image:'/coat.png',color:'BLACK',size:'90(S)'};
const offer=(price,id)=>({'@type':'Offer',price,priceCurrency:'KRW',url:'/coat?itemId='+id});
test('only the selected offer supplies a selling price',()=>{
  const result=parseProductPage(markup({'@graph':[{...item,offers:[offer(199000,2),offer(285000,1)]}]}),page);
  assert.deepEqual(result,{title:'겨울 코트',option:'BLACK · 90(S)',price:'285,000원',shipping:'',description:'',photo:'/coat.png'});
  assert.equal(parseProductPage(markup({...item,offers:[offer(199000,2),offer(240000,3)]}),page).price,'');
  assert.equal(parseProductPage(markup({...item,offers:[offer(199000,2)]}),page).price,'');
  assert.equal(parseProductPage(markup({...item,offers:{'@type':'AggregateOffer',lowPrice:'1000'}}),page).price,'');
});
test('generic pages with a search term, authentication or recommendations do not become listings',()=>{
  assert.throws(()=>parseProductPage('<title>겨울 코트</title><meta property="og:title" content="로그인">',page));
  assert.throws(()=>parseProductPage(markup([item,{...item,name:'추천 코트'}]),page));
  for(const value of ['http://shop.example','https://user@shop.example','https://127.0.0.1','https://[::1]','https://shop.example:9000'])assert.throws(()=>productUrl(value));
});
test('product Open Graph metadata is supported without guessing a missing currency',()=>{
  const html='<meta content="겨울 &amp; 봄" property="og:title"><meta property="product:price:amount" content="125000"><meta property="og:image" content="/front.jpg">';
  assert.equal(parseProductPage(html,page).title,'겨울 & 봄');
  assert.equal(parseProductPage(html,page).price,'');
  assert.equal(parseProductPage(html+'<meta property="product:price:currency" content="KRW">',page).price,'125,000원');
});
test('capture reads price and shipping from the item body, leaves ambiguous prices for review',()=>{
  const rows=['로켓배송','겨울 롱코트','285,000원','무료배송','사이즈','90(S)','색상: BLACK'].map((value,i)=>['5',1,i,1,1,1,800,70+i*45,90,20,93,value].join('\t'));
  const result=extractCaptureFields(rows.join('\n'),1500,900);
  assert.equal(result.shipping,'무료배송');assert.equal(result.option,'BLACK · 90(S)');assert.equal(result.price,'285,000원');assert.equal(result.title,'겨울 롱코트');
  const other=['5',1,9,1,1,1,800,510,90,20,93,'259,000원'].join('\t');
  assert.throws(()=>extractCaptureFields([...rows,other].join('\n'),1500,900));
});

test('phone capture retains the first title line and model beside an installment offer',()=>{
  const line=(id,x,y,h,value)=>['5',1,id,1,1,1,x,y,value.length*12,h,90,value].join('\t');
  const rows=[
    line(1,165,1125,44,'브랜드 >'),line(2,46,1317,38,'브랜드 롱패딩 롱패딩 남녀'),
    line(3,46,1376,38,'롱패딩 여성 롱패딩'),line(4,46,1434,38,'가능'),
    line(5,169,1434,38,'겨울 롱패딩 NC1DR70'),line(6,47,1515,32,'남성 롱다운 코트'),
    line(7,540,1607,44,'월'),line(8,557,1608,44,'95,000원'),
    line(9,47,1630,58,'285,000원'),line(10,44,1794,32,'8 무료배송')
  ];
  const fields=extractCaptureFields(rows.join('\n'),987,2304);
  assert.equal(fields.title,'브랜드 롱패딩 NC1DR70');
  assert.equal(fields.price,'285,000원');
  assert.equal(fields.shipping,'무료배송');
});
