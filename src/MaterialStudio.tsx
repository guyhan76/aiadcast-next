import {useEffect,useRef,useState} from 'react';
import {composeMaterialAd,type MaterialManifest,type MaterialCopy} from './material-ad-render';
import {readMaterialResult,saveMaterialResult,verifyMaterialResult} from './material-result-storage';
import './material-studio.css';
type Input={shape:'open-carton'|'cylinder';widthMm:number;depthMm:number;heightMm:number};
type Job={id:string;input:Input;state:'rendering'|'done'|'failed'|'cancelled';progress:number;error?:string;manifest?:MaterialManifest;imageUrl?:string};
const key='aiadcast-local-material-job-v1';
function restored(){try{return JSON.parse(sessionStorage.getItem(key+'-draft')||'null') as {input?:Input;copy?:MaterialCopy;annotations?:boolean}|null;}catch{return null;}}
export function MaterialStudio(){
 const [input,setInput]=useState<Input>(()=>restored()?.input??{shape:'open-carton',widthMm:500,depthMm:350,heightMm:200}),[copy,setCopy]=useState<MaterialCopy>(()=>restored()?.copy??{company:'',title:'담는 순간,\n전해지는 가치',description:'필요한 크기에 맞춰 준비하는 포장.',contact:''});
 const [job,setJob]=useState<Job|null>(null),[id,setId]=useState(()=>sessionStorage.getItem(key)||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[annotations,setAnnotations]=useState(()=>restored()?.annotations??true),[reviewed,setReviewed]=useState(false),[storageNotice,setStorageNotice]=useState('');const canvas=useRef<HTMLCanvasElement>(null);
 const rendering=busy||job?.state==='rendering',signature=JSON.stringify({input,copy,annotations});
 useEffect(()=>{sessionStorage.setItem(key+'-draft',JSON.stringify({input,copy,annotations}));},[signature]);
 useEffect(()=>{
  if(!id)return;let live=true,timer:number;const urls:string[]=[];
  async function poll(){try{
   const res=await fetch(`/api/material-render/jobs/${id}`);
   if(!res.ok)throw Error('작업을 복구하지 못했습니다. 로컬 렌더 서버가 실행 중인지 확인하고 새로 시작해주세요.');
   const next:Job=await res.json();if(!live)return;if(next.id!==id)throw Error('요청한 작업과 렌더 결과가 일치하지 않습니다.');
   if(next.state==='done'){
    if(!next.manifest||next.imageUrl!==`/api/material-render/jobs/${id}/image`)throw Error('렌더 결과 정보가 올바르지 않습니다.');
    const response=await fetch(next.imageUrl);if(!response.ok)throw Error('렌더 이미지를 불러오지 못했습니다.');
    const result={id,input:next.input,manifest:next.manifest,image:await response.blob()};
    await verifyMaterialResult(result);if(!live)return;
    try{await saveMaterialResult(result);if(live)setStorageNotice('완료한 렌더를 이 브라우저에 저장했습니다. 로컬 서버가 꺼져도 같은 탭에서 복구할 수 있습니다.');}
    catch{if(live)setStorageNotice('이 브라우저에 렌더를 저장하지 못했습니다. 새로고침 전에 PNG를 다운로드해주세요.');}
    if(!live)return;next.imageUrl=URL.createObjectURL(result.image);urls.push(next.imageUrl);
   }
   setJob(next);
   if(next.state==='rendering')timer=window.setTimeout(poll,1000);
   else if(next.state==='failed')setError(next.error==='BLENDER_NOT_INSTALLED'?'Blender가 설치되어 있지 않습니다.':'렌더에 실패했습니다. 로컬 서버 로그를 확인해주세요.');
  }catch(e){if(live){setError(String(e));setJob(null);}}}
  async function restore(){
   try{const result=await readMaterialResult(id);if(!live)return;if(result){
    await verifyMaterialResult(result);if(!live)return;const imageUrl=URL.createObjectURL(result.image);urls.push(imageUrl);
    setJob({id,input:result.input,manifest:result.manifest,imageUrl,state:'done',progress:100});setStorageNotice('이 브라우저에 저장한 렌더를 복구했습니다. 추가 렌더는 실행하지 않았습니다.');return;
   }}catch{if(live)setStorageNotice('브라우저의 저장 결과를 읽지 못해 로컬 서버에서 확인합니다.');}
   if(live)await poll();
  }
  void restore();return()=>{live=false;clearTimeout(timer);urls.forEach(url=>URL.revokeObjectURL(url));};
 },[id]);
 useEffect(()=>{setReady(false);setReviewed(false);if(job?.state!=='done'||!job.manifest||!job.imageUrl||JSON.stringify(job.input)!==JSON.stringify({...input,depthMm:input.shape==='cylinder'?input.widthMm:input.depthMm}))return;let live=true;const scratch=document.createElement('canvas');void composeMaterialAd(scratch,job.imageUrl,job.manifest,copy,annotations).then(()=>{if(!live||!canvas.current)return;canvas.current.width=scratch.width;canvas.current.height=scratch.height;canvas.current.getContext('2d')!.drawImage(scratch,0,0);setReady(true);setError('');}).catch(e=>{if(live)setError(String(e));});return()=>{live=false};},[job?.id,job?.state,signature]);
 async function start(){setBusy(true);setError('');setStorageNotice('');setReady(false);setReviewed(false);try{const res=await fetch('/api/material-render/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Aiadcast-Local-Render':'1'},body:JSON.stringify(input)});if(!res.ok)throw Error(res.status===409?'다른 렌더가 끝난 뒤 다시 시도해주세요.':'로컬 렌더 서버와 규격(10~2000 mm, 축 비율 10 이하)을 확인해주세요.');const next:Job=await res.json();sessionStorage.setItem(key,next.id);setJob(next);setId(next.id);}catch(e){setError(String(e));}finally{setBusy(false);}}
 async function cancel(){if(!id)return;try{const res=await fetch(`/api/material-render/jobs/${id}`,{method:'DELETE',headers:{'X-Aiadcast-Local-Render':'1'}});if(!res.ok)throw Error('취소 상태를 확인하지 못했습니다.');setJob(await res.json());}catch(e){setError(String(e));}}
 function download(){if(!ready||!reviewed||!canvas.current)return;canvas.current.toBlob(blob=>{if(!blob){setError('PNG를 만들지 못했습니다. 다시 저장해주세요.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aiadcast-material-ad-prototype.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');}
 return <main className="material-studio"><a href="/">← aiadcast</a><header><p>LOCAL MATERIAL STUDIO</p><h1>규격을 담은 광고 시안</h1><p>입력 치수로 만든 본체에 조명·절차적 재질을 적용합니다. 사진·인쇄 복원과 운영 제공은 아직 연결되지 않았습니다. 유료 AI 호출·이용권 차감 없음.</p></header><div className="material-layout"><section className="material-inputs"><h2>제품과 광고 문구</h2><fieldset disabled={!!rendering}><label>형태<select value={input.shape} onChange={e=>setInput({...input,shape:e.target.value as Input['shape']})}><option value="open-carton">열린 박스</option><option value="cylinder">직선 원통 본체</option></select></label>{(['widthMm',...(input.shape==='open-carton'?['depthMm']:[]),'heightMm']as (keyof Omit<Input,'shape'>)[]).map(k=><label key={k}>{k==='widthMm'?(input.shape==='cylinder'?'지름 mm':'가로 mm'):k==='depthMm'?'깊이 mm':'높이 mm'}<input type="number" min="10" max="2000" value={input[k]} onChange={e=>setInput({...input,[k]:Number(e.target.value)})}/></label>)}<p>본체 외측 치수입니다. 박스 덮개·두께, 원통 표면은 예시이며 실물에서 측정한 값이 아닙니다.</p></fieldset>{(['company','title','description','contact']as const).map(k=><label key={k}>{{company:'회사명 (선택)',title:'광고 제목',description:'설명',contact:'연락처 (선택)'}[k]}<textarea rows={k==='title'?2:1} maxLength={k==='description'?160:80} value={copy[k]} onChange={e=>setCopy({...copy,[k]:e.target.value})}/></label>)}<label><input type="checkbox" checked={annotations} onChange={e=>setAnnotations(e.target.checked)}/>본체에 규격 표시</label><button disabled={!!rendering} onClick={()=>void start()}>재질 렌더 시작</button>{rendering&&<><progress max="100" value={job?.progress??1}/><p role="status">제품 렌더 중 · {job?.progress??1}%</p><button onClick={()=>void cancel()} disabled={!id}>렌더 취소</button></>}{job?.state==='cancelled'&&<p role="status">렌더를 취소했습니다.</p>}{error&&<p role="alert">{error}</p>}</section><section className="material-output"><h2>광고 미리보기</h2>{storageNotice&&<p role="status">{storageNotice}</p>}<canvas ref={canvas} hidden={!ready} aria-label="재질 렌더 광고 미리보기"/>{!ready&&<p>렌더가 끝나면 광고를 확인할 수 있습니다. 치수를 바꾼 경우 다시 렌더해주세요.</p>}<label><input type="checkbox" disabled={!ready} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>형상·축·문구와 절차적 재질 사용 범위를 확인했습니다.</label><button disabled={!ready||!reviewed} onClick={download}>미리보기 PNG 저장</button></section></div></main>;
}
