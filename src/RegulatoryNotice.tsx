import {from './ui-language';
import type {ProductCategory} from './industry';

type Notice={tit;
type NoticeMap=Partial<Record<ProductCategory,Notice>>&{custom?:Partial<Record<string,Noti 검토를 권장합니다)
const notices:NoticeMa표시 사항 (공인중개사법 등)',
  items:[
   '광고 유형에 따소명, 주소, 전화번호, 등록번호, 대표 공인중개사 성명번호, 입주 시기, 청약 일정',
   '임대·관리: 리비, 계약 조건',
  ],
  warning:'부동산 광고는 표시·광고법, 공인중위·과장 광고 시 과태료 및 형사처벌 대상입니다.',
 },관명, 의료인 성명, 진료과목, 주소, 전화번호',
   '비급여 진료 항목의 경우 비용 범위 표시',
   '방송·인터넷 광고는 한국의료광고심의위원회 사전 심의 필수',
  ],
  wa는 금지됩니다. 위반 시 자격정지 및 형사처벌 대상입니다.',
 },
 food:{
  title:'식품 식품법)',
  items:[
   '질병 치료·예방 효과 표시 금지',
   '건강기능식품이 아닌 일반식품은 기능성 표시 불가',
   '의약품으로 오인할 수 있는 표현 금지',
   '주류 광고 시 "19세 미만 청소년에게 판매 금지" 표시',
  ],
  warning:'건강기능식품의 경우 기능성 내를 표시하면 처벌 대상입시 금지',
   '투자 위험  수익을 보장하지 않음 명시',
  ],
  warning:'허e:'주식 투자 광고 규제 (자본시장법) 미래를 보장하지 않음',
  ],
  warning:'불공용, 시세조종 관 표현은 형사처벌 대상입니다.',
 },
 crypto:{
  title:'디지털 자산 광고 규제 (특정금융정보법)',
  items:[
   '수익 보장 표 가능)',
   '사업자 신고 계, 유사수신 행금융 서비스 광고 규제 (금융소비자보호법)',
  items:[
   '이자율, 수수료 등 정확한 비용 표시',
   '대출 광고 시 최고·최저 금리, 중도상환 수수료 명시',
   '금리 인하 보장 등 허위·과장 표시 금지',
  ],
 },
 insurance:{
  title:'보험 광고 규제 (보험업법)',
  items:[
   '보험 상품명,   '보장 내용의 일부만 발췌 시 "상품별 세부 내용 확인 필요" 표시',
   '보험금 지급 제한 사항 축소·누락 금지',
  ],
  warning:'허위·과장 광고 시 영업정지 학원 등록번호, 교습비 표시',
   '합격률, 성적 향상 보장 표현 금지',
   '허위·과장 광고 금지 (경력, 시설 등)',
  ],
 },
 biotech:{
  title:'약사법)',
  items:[
   '의약품 광고는 식품의약품안전처 사전 심기한 광고 제한',
   '효능·효과 과대 표시 금지',
  ],
  wa 표현은 처벌 대상입니다.',
 },
 tarot:{
  title:'운세·상담 서비스 광고 유의사항',
  items:[
   '미래를 단정하거나 보장하는 표현 금지',
   '상담 비용, 환불 조건 명확히 표시',
보장 금지',
  ],
 },
 astrology:{
  title:'운세·상담 서비스 광고 유의사항',
  items:[
   '미래를 단   '과학적 근거가 없는 효과 보장 금지',
  ],
 },
 myeongri:{
  title:'운세·상담 서비스 광고 유의사항',
  items:[
   '미래를 단정하거나 보장하는 표현 금지',
   '상담 비용, 환불 조건 명확히 표시',
   '과학적 근거가 없는 효:'운세·상담 서비스 광고 유의사항',
  items:[
   '미래를 단정,
  ],
 },
 // 직접 입력한 업종 (IndustrySearch에서 상세m:{
  '분양':{
   title:'분양 광고 표시 사항 (주택법, 표시·광고법)',
   items:[
    '시행사명, 시공사명 표시',
    '사업승인번호, 입주 예정 시기',
    '청약 일정, 분양가, 면적 정변 환경, 입지 등)',
   ],
   warning:'분양 광사처벌 대상입니다.',
  },
  '중개':{
   title:'부동산 중개 광고 표주소, 전화번호',
    '중개사무소 등록번호',
    '대표 공인중개사 성명',
   ],
   warning:'위 정보를 광고에 표시하지 않으면 항 (민간임대주택법, 표시·광고법)',
   items:[
    '임대'임대료, 관리비, 보증금',
    '계 },
  '임대관리':{
   title:'임대 관리 광고 표시 사항 (민간임대주택법)',
   items:[
    '임대사업자 등록번호 (등록 사업자의 경우)'명, 법무법인명(해당 시)',
    '사무소 주소, 전화번호',
    '허위·과장 광고 금지 (승소율, 경력 등)'변호사법 위반 시 징계 및 형사처벌 대상입니다.',
  },
  '세무':{
   title:'세무 서비스 광고 규제 (세무사법)',
   items:[
    '세무사 성명, 사무소명',
    '사무소 주소, 전화번호',
    '허위·과장 광고 금지',
   ],
  },
  '회계':{
   title:'회계 서비스 광고 규제 (공인회계사법)',
   items:[
    '공인회계사 성명, 회계법인명(해당 시)',
    '사무소 주소, 전화번호',
    '허위·과장 광고 금지',
   ],
  },
 },
};

const sessionKey='aiadcast.regulatory-confirmed';
const getConfirmed=():Set<string>=>{
 try{return new Set(JSON.parse(sessionStorage.getItem(sessionKey)??'[]'Set();}
};
const setConfirmed=(key:string)=>{
 const confirmed=getConfirmed();confirmed.add(key);
 sessionStorage.setItem(sessionKey,JSON.stringify([...confirmed]));
};

// 직접 입력rch와 같은 패턴)
const industryLine=/^(?:업.*)(?:\r?\n|$)/;
function parseCustomIndustry(material:string):string|null{
 const match=industryLine.exec( null;
 // "부동산 서비스 > 분양" → "분양", "생활/홈 서비plit('>').map(s=>s.trim());
 return parts[parts.length-1]||null;
}

export function RegulatoryNotice,onConfirm}:{category:ProductCategory;material:string;confirmed:boolean;onConfirm:()=>void}){
 const {t}=useUiLanguage(),id=useId();
 const [checked,setChecked]=useState(false);
 
 const custom=parseCustomIndustry(material);
 const notice=custom&&notices.custom?.[custom]||notices[categor const key=custom||category;
 const wasConfirmed=getConfirmed().has(key);

 useEffect(()=>{
  setChecked(false);
  if(wasConfirmed)onConfirm();
 },[key]);

 if(!notice||wasConfirmed||confirmed)return null;

 function confirm(){
  if(!checfirm();
 }

 return <div role="alert" style={{padding:'1rem',background:'#fef3c7',border:'2px solid #f59e0b',borderRadiu 0.75rem',fontSize:'1rem',fontngLeft:'1.25rem',fontSize:'0.9rem',colem}</li>)}
  </ul>
  {notice.warning&&<p style={{margin:'0 0 0.75rem',padding:'0.5rem',background:'#fed7aa',borderRadius:4,fontSize:'0.85rem',color:'#92400e',fontWeight:600}}>{notice.warnin9rem',fontWeight:600}}>
   <input id={id} type="checkbox" checked={checked} o 내용을 확인했으며 광고 제작 시 반영하겠습니다.','I have reviewed the above requirements and will comply when creating the ad.')}
  </label>
  <button type="button