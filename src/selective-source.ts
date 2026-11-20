import type {Project} from './model.ts';
import type {GenerationJob} from './generation-client.ts';
import {completeAdKey} from './complete-ad.ts';
import {hasUsableCreative} from './generated.ts';

export function acceptedEditSourceMatches(project:Project,job:GenerationJob):boolean {
 const generated=project.generated;
 return !!generated&&hasUsableCreative(project)&&!!job&&job.id===generated.jobId&&job.projectId===project.id&&job.state==='accepted'&&job.mode===generated.mode
  &&job.composition==='complete-ad'&&job.compositionKey===completeAdKey(project)&&job.sourceHash===generated.sourceHash
  &&job.artifactId===generated.asset.sha256&&job.artifact?.sha256===generated.asset.sha256&&job.artifact.id===generated.asset.sha256
  &&job.artifact.width===generated.asset.width&&job.artifact.height===generated.asset.height
  &&!job.inputMode&&!job.dimensionDisplay&&!job.planarReport&&!project.textEdit&&!project.exactTextVersion
  &&(!project.dimensionAnnotation||project.dimensionAnnotation.mode==='none');
}
