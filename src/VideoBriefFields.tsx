import {useUiLanguage} from './ui-language';
import type {VideoBrief} from './video-brief';

export function VideoBriefFields({value,disabled,change}:{value:VideoBrief;disabled:boolean;change:(v:VideoBrief)=>void}){
  const {t}=useUiLanguage();
  const service=value.kind==='service';
  const description = service
    ? [
        t('오후 햇살이 드는 카페에서 주문 즉시 아이스 카페라떼를 만들어요.', 'The sunlit café makes each iced latte to order.'),
        t('원목 바 위 투명한 잔에는 흰 우유가 바닥부터 차 있고, 각얼음 사이도 우유로 채워져 있어요.', 'On the wooden counter, milk fills the clear glass from the bottom and surrounds each ice cube.'),
        t('에스프레소를 얼음 모서리에 부어요. 잔의 위치와 빛은 끝까지 같아요.', 'Pour espresso onto an exposed ice edge. Keep the glass and light in the same position.')
      ].join('\n')
    : [
        t('첫눈 오는 아침, 버스 정류장의 노란 불빛 아래 검은 후드에 눈이 내려앉아요.', 'Early snow settles on a black hood in the amber light of a bus shelter.'),
        t('검은색 롱패딩은 후드부터 무릎까지 이어지고, 양옆에는 지퍼 주머니가 있어요.', 'The knee-length black puffer has a hood and two zip pockets.'),
        t('바람이 후드를 스치면 눈가루가 날리고 옆선과 밑단이 드러나요.', 'A gust scatters the snow, revealing the side seam and hem.')
      ].join('\n');
  const highlight = service
    ? [
        t('첫 1초, 에스프레소가 우유 밖으로 살짝 나온 얼음 모서리에 닿는 순간 얼음이 한 번 흔들려요.', 'In the first second, espresso hits the exposed edge of one ice cube and makes it rock.'),
        t('잔 뒤로 햇빛이 들고, 갈색 선이 그 얼음 양옆을 타고 내려와 바로 아래에서 두 갈래로 퍼져요.', 'Backlight the glass as coffee runs down either side of the cube and forms two trails just below it.'),
        t('마지막엔 완성된 잔의 색과 잦아드는 파문을 보여주세요. 손과 얼굴은 화면 밖에 둬요.', 'End on the finished drink and settling ripples. Keep hands and faces outside the frame.')
      ].join('\n')
    : [
        t('첫 1초, 후드에 쌓인 흰 눈이 바람에 흩어지며 검은 원단이 드러나요.', 'In the first second, wind sweeps white snow off the hood and exposes the black fabric.'),
        t('눈가루 뒤로 주머니 지퍼의 금속 결에 초점을 맞춰주세요.', 'Focus through the powder onto the grain of the metal pocket zip.'),
        t('마지막엔 옆선에서 뒤로 빠져 후드와 긴 밑단을 한 화면에 담아주세요.', 'Pull back from the side seam to frame the entire hood and long hem.')
      ].join('\n');
  const shots = service
    ? [
        t('아직 섞이지 않은 흰 우유를 잔 옆에서 잡아요. 바닥과 수면을 함께 보여주고, 에스프레소가 닿자 같은 얼음이 기울며 우유 표면에 작은 파문이 생겨요.', 'Frame the bottom and the single milk surface together. As espresso strikes the ice, the cube tilts and a small ripple crosses the surface.'),
        t('그 얼음을 계속 따라가세요. 양옆을 흐른 갈색 줄기가 얼음 아래에서 두 갈래로 퍼지고, 선의 가장자리부터 흰 우유와 섞여 연갈색이 돼요.', 'Stay on the same cube. Two brown trails spread beneath it and soften at the edges as they mix into the milk.'),
        t('붓기가 멎고 얼음이 잔잔해지면 같은 잔 전체를 담아요. 마지막까지 잔과 음료가 화면의 중심이에요.', 'As the pour stops and the ice settles, widen to the same glass. Hold on the drink through the last frame.')
      ]
    : [
        t('검은 후드에 쌓인 눈을 가까이 잡아요. 바람에 눈가루가 번쩍이며 흩어지고 그 사이로 버스 전조등이 드러나요.', 'Start tight on snow on the black hood. Wind scatters the backlit powder and bus headlights emerge behind it.'),
        t('옆주머니를 비스듬히 비추는 빛을 따라가요. 지퍼의 금속 결에서 봉제선으로 초점을 옮겨요.', 'Track the grazing light along the pocket, shifting focus from the zip to the stitching.'),
        t('카메라가 물러나 정류장의 밝은 유리벽 앞에 롱패딩 전체가 보여요. 긴 밑단이 바람에 한 번 흔들리고 멈춰요.', 'Pull back to the entire coat against the lit shelter. A gust lifts the hem and it settles.')
      ];
  const stages = [t('첫 1초', 'First second'), t('중간 장면', 'Middle shot'), t('마지막 장면', 'Closing shot')];
  const example=t('예) ', 'e.g. ');
  return <fieldset className="vd-brief" disabled={disabled}>
    <label>{service?t('서비스명','Service name'):t('상품명','Product name')}
      <input maxLength={100} value={value.title} onChange={e=>change({...value,title:e.target.value})}/></label>
    <label>{t('상세설명','Description')}
      <textarea rows={6} maxLength={2000} value={value.description} placeholder={example+description}
        onChange={e=>change({...value,description:e.target.value})}/></label>
    <label>{t('강조할 점 (선택)','Highlight (optional)')}
      <textarea rows={6} maxLength={600} value={value.emphasis} placeholder={example+highlight}
        onChange={e=>change({...value,emphasis:e.target.value})}/></label>
    <details className="input-example-guide">
      <summary>{t('더 좋은 결과를 위한 예시 가이드','Example guide for better results')}</summary>
      <div className="input-example-content">
        {shots.map((shot,i)=><p key={stages[i]}><strong>{stages[i]}</strong><br/>{shot}</p>)}
      </div>
    </details>
  </fieldset>;
}
