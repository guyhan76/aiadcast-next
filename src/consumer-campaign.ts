import {newProject} from './model.ts';
import type {Project} from './model.ts';
import {withCategory} from './product.ts';
import type {ProductCategory} from './industry.ts';
import {defaultCampaign} from './campaign.ts';
import {defaultCreative,creativeCopy,creativeSettings} from './creative.ts';
export function starterProject(category:ProductCategory='other'):Project{
 const p=withCategory(newProject(),category);return {...p,name:'',format:'9:16',presentation:'campaign',generation:{mode:'creative',brief:''},background:{...p.background,color:'#f8f7f4'},productProfile:{...p.productProfile,specType:'none'},dimensions:{...p.dimensions,displayUnit:'cm',width:'',depth:'',height:'',visible:false,lines:false},campaign:{...defaultCampaign(),creative:defaultCreative()},footer:{company:true,contact:true,email:true,website:true},copy:{ko:{title:'',description:'',company:'',contact:'',email:'',website:''},en:{title:'',description:'',company:'',contact:'',email:'',website:''}}};
}
export function prepareCampaign(project:Project):Project{
 const automatic=creativeSettings(project).copyMode==='ai';
 return {...project,name:project.productName+(project.locale==='ko'?' 광고':' ad'),presentation:'campaign',updatedAt:new Date().toISOString(),copy:{...project.copy,[project.locale]:{...project.copy[project.locale],...(automatic?creativeCopy(project):{})}}};
}
