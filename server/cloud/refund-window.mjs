// Korea Astronomy and Space Science Institute's official calendar (월력요항).
// https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027
// Outside the published dates an operator verifies the deadline before declining.
const holidays=new Set([
 '2026-12-25','2027-01-01','2027-02-06','2027-02-07','2027-02-08','2027-02-09',
 '2027-03-01','2027-05-01','2027-05-03','2027-05-05','2027-05-13','2027-06-06',
 '2027-07-17','2027-07-19','2027-08-15','2027-08-16','2027-09-14','2027-09-15',
 '2027-09-16','2027-10-03','2027-10-04','2027-10-09','2027-10-11','2027-12-25','2027-12-27'
]);
const day=86400000, seoulOffset=9*3600000;
export function refundDeadline(start){
 if(!start)return null;
 const at=new Date(start).getTime();
 if(!Number.isFinite(at))return null;
 const last=new Date((Math.floor((at+seoulOffset)/day)+7)*day);
 for(;;){
  const date=last.toISOString().slice(0,10);
  if(date<'2026-11-18'||date>'2027-12-31')return null;
  if(![0,6].includes(last.getUTCDay())&&!holidays.has(date))return new Date(last.getTime()+day-seoulOffset-1).toISOString();
  last.setUTCDate(last.getUTCDate()+1);
 }
}
