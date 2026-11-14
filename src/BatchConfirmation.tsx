import {useEffect,useRef} from 'react';
import type {BatchPrice} from './batch-price';
import {useUiLanguage} from './ui-language';

export function BatchConfirmation({price,busy,onConfirm,onClose}:{price:BatchPrice;busy:boolean;onConfirm:()=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),{t}=useUiLanguage();
 useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
 return <dialog className="batch-confirm" aria-labelledby="batch-confirm-title" ref={dialog} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <h2 id="batch-confirm-title">{t('광고 생성 확인','Confirm generation')}</h2>
  <p>{t(`광고 이미지 ${price.count}장을 생성합니다.`,`Generate ${price.count} ad image(s).`)}</p>
  <dl>
   <dt>{t('현재 크레딧','Current credits')}</dt><dd>{price.credits.toLocaleString()}</dd>
   <dt>{t('차감 예정','Credits to use')}</dt><dd>{price.creditsUsed.toLocaleString()}</dd>
   <dt>{t('생성 후 잔여 크레딧','Remaining credits')}</dt><dd>{price.creditsAfter<0?'—':price.creditsAfter.toLocaleString()}</dd>
   {price.ticketsUsed>0&&<><dt>{t('기존 이용권 사용','Legacy tickets used')}</dt><dd>{price.ticketsUsed} / {price.tickets}</dd></>}
  </dl>
  {price.admin&&<p>{t('관리자 테스트 · 차감 없음','Administrator test · no charge')}</p>}
  {price.creditsAfter<0?<p role="alert">{t(`${-price.creditsAfter}크레딧이 부족합니다. 장수를 줄이거나 크레딧을 충전해주세요.`,`You need ${-price.creditsAfter} more credits. Choose fewer images or add credits.`)}</p>:
   !price.admin&&<p>{t('확인하면 사용 가능 잔액에서 예약됩니다. 생성 실패분은 복원됩니다.','Confirmation reserves the amount from your available balance. Failed images are credited back.')}</p>}
  <div className="batch-actions"><button type="button" disabled={busy} onClick={onClose}>{t('취소','Cancel')}</button><button type="button" disabled={busy||price.creditsAfter<0} onClick={onConfirm}>{busy?t('접수 중…','Submitting…'):t('확인','Confirm')}</button></div>
 </dialog>;
}
