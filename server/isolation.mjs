// Offline configuration guard. This does not provision resources, change account
// permissions or revoke vendor access. A future server must call it at startup.
const resourceKeys=['authProject','database','storageBucket','openaiProject'];
export const environmentNames=['local','staging','production'];
export function isolationIssues(plan,{requireConnected=false,environment='production'}={}) {
 const errors=[];
 if(plan?.schemaVersion!==1||plan.projectId!=='aiadcast-next')return ['독립 앱 설정 형식이 올바르지 않습니다.'];
 if(!environmentNames.includes(environment))errors.push('알 수 없는 실행 환경입니다.');
 if(plan.repository?.visibility!=='private')errors.push('새 소스 저장소는 비공개여야 합니다.');
 const ids=['storeApplicationId','developmentApplicationId','stagingApplicationId'].map(key=>plan.android?.[key]);
 if(ids.some(id=>typeof id!=='string'||!/^com\.selluplabs\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(id)))errors.push('별도 Android 앱 식별자를 확인해주세요.');
 if(new Set(ids).size!==ids.length||ids.includes(plan.android?.legacyApplicationId))errors.push('신규 앱·개발용 앱·기존 MVP의 식별자가 겹칩니다.');
 const legacy=plan.legacyPolicy;
 if(!legacy||legacy.connectToExistingBackend!==false||legacy.importAccountsOrCredits!==false||legacy.reuseApiKeysOrSigningMaterial!==false)errors.push('기존 MVP 서버·회원·이용권·비밀 설정의 자동 연결은 허용하지 않습니다.');
 const knownLegacy=new Set(legacy?.resourceIds??[]);
 const seen=new Map();
 const record=(type,value,name)=>{
  if(value===null||value===undefined)return;
  if(typeof value!=='string'||!value.trim()){errors.push(`${name}: ${type} 설정이 잘못되었습니다.`);return;}
  const key=type+':'+value;
  if(seen.has(key))errors.push(`${name}: ${type}이 ${seen.get(key)} 환경과 공유됩니다.`);
  if(knownLegacy.has(value))errors.push(`${name}: 기존 MVP 리소스를 참조합니다.`);
  seen.set(key,name);
 };
 for(const name of environmentNames){
  const env=plan.environments?.[name];if(!env){errors.push(`${name} 환경이 없습니다.`);continue;}
  if(env.namespace!==`aiadcast-next-${name}`)errors.push(`${name}: 새 앱 전용 저장 영역 이름이 필요합니다.`);
  if(!['disabled','sandbox','live'].includes(env.billingMode)||(name!=='production'&&env.billingMode==='live'))errors.push(`${name}: 실제 결제 모드를 허용하지 않습니다.`);
  if(env.secrets?.openai!==`AIADCAST_NEXT_${name.toUpperCase()}_OPENAI_API_KEY`)errors.push(`${name}: 새 앱 전용 비밀 설정 이름이 필요합니다.`);
  for(const key of resourceKeys)record(key,env.resources?.[key],name);
  if(env.apiOrigin!==null&&env.apiOrigin!==undefined){
   try {const url=new URL(env.apiOrigin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();record('apiOrigin',url.origin,name);}
   catch {errors.push(`${name}: 비밀값이 없는 HTTPS API 원점이 필요합니다.`);}
  }
 }
 if(requireConnected){
  const selected=plan.environments?.[environment];
  if(!plan.repository?.owner||!plan.repository?.remote||plan.repository.ownershipVerified!==true)errors.push('회사 소유의 비공개 원격 저장소와 접근 권한 검증이 필요합니다.');
  if(legacy?.inventoryVerified!==true)errors.push('기존 MVP 리소스와 새 계정 권한의 분리 확인이 필요합니다.');
  if(!selected?.apiOrigin||selected?.companyControlVerified!==true)errors.push(`${environment}: 회사가 관리하는 API·계정 연결 확인이 필요합니다.`);
  for(const key of resourceKeys)if(!selected?.resources?.[key])errors.push(`${environment}: ${key} 연결이 아직 없습니다.`);
 }
 return errors;
}

// Never fall back to OPENAI_API_KEY or an old MVP binding. The caller must supply
// the environment explicitly. This function never prints or returns secret values.
export function providerBinding(plan,environment,available=process.env){
 if(!environmentNames.includes(environment))throw Error('Explicit environment required');
 const issues=isolationIssues(plan,{requireConnected:environment!=='local',environment});
 if(issues.length)throw Error(issues.join(' '));
 const selected=plan.environments[environment];
 if(!selected.resources.openaiProject)throw Error('Independent OpenAI project is not connected');
 if(!available[selected.secrets.openai])throw Error('Independent OpenAI secret binding is missing');
 return Object.freeze({environment,projectId:selected.resources.openaiProject,secretBinding:selected.secrets.openai});
}
