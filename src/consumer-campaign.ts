import {withoutDimensionReshape} from './generation.ts';
import {isTextExample} from './generation-input.ts';
import {newProject} from './model.ts';
import type {Project} from './model.ts';
import {withCategory} from './product.ts';
import type {ProductCategory} from './industry.ts';
import {defaultCampaign} from './campaign.ts';
import {defaultCreative,creativeCopy,creativeSettings} from './creative.ts';
// A production brief for the finished-ad path. It contains no product facts and
// never replaces an explicit customer brief or an original-photo selection.
export const finishedAdBrief='Create one unified finished advertisement with a dominant subject, a bold mobile-readable headline and deliberate type scale. Integrate the subject into a coherent scene; do not paste an opaque white catalog-photo rectangle onto an unrelated room. Make a supplied price prominent with its quantity and conditions attached. Keep dimensions compact and avoid a document-like information sheet. Use only supplied facts; retain approved manual copy and qualifications. Follow the customer\'s specific design requests.';
export function starterProject(category:ProductCategory='other'):Project{
 const p=withCategory(newProject(),category);return {...p,name:'',format:'9:16',presentation:'campaign',generation:{mode:'creative',brief:''},background:{...p.background,color:'#f8f7f4'},productProfile:{...p.productProfile,specType:'none'},dimensions:{...p.dimensions,displayUnit:'cm',width:'',depth:'',height:'',visible:false,lines:false},campaign:{...defaultCampaign(),creative:defaultCreative()},footer:{company:true,contact:true,email:true,website:true},copy:{ko:{title:'',description:'',company:'',contact:'',email:'',website:''},en:{title:'',description:'',company:'',contact:'',email:'',website:''}}};
}
export function automaticDimensionDraft(project:Project):Project{
 const a=project.dimensionAnnotation;
 if(project.generation.mode!=='creative'||a?.method==='manual'||a?.method==='ai')return project;
 // Migrate only a creation draft. Stored results and their review evidence stay unchanged.
 return {...project,dimensionAnnotation:{method:'manual',mode:a?.mode??'none',snapshot:''}};
}
export function prepareCampaign(project:Project):Project{
 // Convert only the explicitly submitted new request, never the restored draft/result.
 const annotation=project.dimensionAnnotation;
 project=withoutDimensionReshape(project.generation.mode==='creative'?{...project,dimensionAnnotation:{method:'ai',mode:annotation?.mode??'none',snapshot:''},dimensions:{...project.dimensions,visible:!!annotation&&annotation.mode!=='none',lines:!!annotation&&annotation.mode!=='none'}}:project);
 const automatic=creativeSettings(project).copyMode==='ai';
 return {...project,name:project.productName+(project.locale==='ko'?' 광고':' ad'),presentation:'campaign',generation:{...project.generation,brief:project.generation.mode==='creative'&&!project.generation.brief.trim()?finishedAdBrief:project.generation.brief},updatedAt:new Date().toISOString(),copy:{...project.copy,[project.locale]:{...project.copy[project.locale],...(automatic?creativeCopy(project):{})}}};
}

// Explicitly prepare a new draft, without requesting an image or accepting a
// charge. The old project/result and all source bytes stay intact.
export function creativeCampaignDraft(project:Project):Project{
 const {generated:_generated,background,publishing:_publishing,...source}=project;
 return prepareCampaign({...source,id:crypto.randomUUID(),generation:{mode:'creative',brief:project.generation.brief,...(isTextExample(project)?{inputMode:'text-example',photoMode:project.generation.photoMode}:{})},background:{...background,image:null}});
}
