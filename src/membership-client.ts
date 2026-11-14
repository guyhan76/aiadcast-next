import {betaSession,storageNamespace} from './beta-session';
import {offlineDemo} from './demo-mode';
import {apiRequest} from './generation-client';
import type {Project} from './model';
export async function storeAcceptedProject(project:Project){
 const token=betaSession()?.token;
 if(!token||offlineDemo())return;
 const {plan}=await apiRequest<{plan:string}>('/api/membership');
 if(plan==='standard'&&betaSession()?.token===token)await saveCloudSnapshot(project);
}
export async function saveCloudSnapshot(project:Project){
 const key='aiadcast.cloud-revision:'+storageNamespace()+':'+project.id;
 const result=await apiRequest<{revision:number}>('/api/projects/'+project.id,{project,revision:Number(sessionStorage.getItem(key)??0)});
 sessionStorage.setItem(key,String(result.revision));window.dispatchEvent(new Event('aiadcast-cloud-project-change'));
}
