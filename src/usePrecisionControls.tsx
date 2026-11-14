import {PrecisionControls} from './PrecisionControls';
import type {Project} from './model';

export function usePrecisionControls(project:Project,onChange:(p:Project)=>void){
  return <PrecisionControls project={project} change={update=>onChange(update(project))}/>;
}
