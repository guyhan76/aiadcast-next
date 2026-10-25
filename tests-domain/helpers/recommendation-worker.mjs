import {appendFileSync} from 'node:fs';
import {RecommendationService} from '../../server/recommendations/service.mjs';
import {hash} from '../../server/recommendations/contracts.mjs';
import {mockRecommendationAdapter} from '../../server/recommendations/mock-adapter.mjs';
const [path,log,requestId]=process.argv.slice(2),imageBytes=Buffer.from('fixture image');
const mock=mockRecommendationAdapter(),service=new RecommendationService({path,enabled:true,resolveOwnedImage:async()=>({ownerId:'a',media:'image',persisted:true,imageBytes,artifactHash:hash(imageBytes),snapshot:{productName:'Example',facts:[],directions:'Bright',confirmedCopy:['Example'],adLanguage:'en',purpose:'sales',format:'1:1'}}),adapter:async args=>{appendFileSync(log,'dispatch\n');await new Promise(r=>setTimeout(r,100));return mock.adapter(args);}});
try{await service.request({userId:'a'},{generationId:'g',requestId,locale:'en'});}finally{service.close();}
