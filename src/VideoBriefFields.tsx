import {useUiLanguage} from './ui-language';
import type {VideoBrief} from './video-brief';

type Translate = (ko: string, en: string) => string;

function briefExample(value: VideoBrief, t: Translate) {
  if (value.kind === 'service' && value.style === 'presenter') {
    return {
      description: [
        t('점심시간, 카페 픽업대에서 방금 주문한 아이스 카페라떼를 받아요.', 'At lunch I pick up my freshly made iced latte at the café counter.'),
        t('투명한 잔 옆면에 흰 우유와 에스프레소가 섞이는 갈색 무늬가 아직 보여요.', 'Through the clear glass I can still see brown ribbons of espresso blending into white milk.'),
      ].join('\n'),
      highlight: [
        t('잔을 들어 올리자 얼음이 잔 벽에 톡 부딪혀요. 첫 1초에 그 소리와 움직임을 함께 담아주세요.', 'As I lift the glass, ice taps its wall. Catch the sound and movement together in the first second.'),
        t('한 모금 마신 뒤에는 같은 잔을 다시 가까이 보여주세요.', 'After my first sip, bring the same glass close again.'),
      ].join('\n'),
      shots: [
        t('손님 시점에서 잔을 받는 손과 옆면을 가까이 잡아요. 얼음이 부딪히며 우유 속 갈색 무늬가 살짝 흔들려요.', 'From the guest’s viewpoint, frame the hand and the side of the glass as the ice taps and the coffee ribbons sway.'),
        t('같은 손님이 창가에서 잔을 들어 한 모금 마셔요. 잔 너머로 첫 모금의 표정이 잠깐 보여요.', 'Follow the same guest taking a sip by the window, with a brief glimpse of their expression beyond the rim.'),
        t('잔을 테이블에 내려놓을 때 시선도 따라 내려와요. 안쪽에 남은 갈색 무늬와 잦아드는 물결로 끝내요.', 'Follow the glass down to the table and finish on the remaining coffee ribbons as the ripples settle.'),
      ],
    };
  }
  if (value.kind === 'service') {
    return {
      description: [
        t('오후 햇살이 드는 카페에서 주문 즉시 만드는 아이스 카페라떼예요.', 'We make each iced latte to order in our sunlit café.'),
        t('원목 바 위 투명한 잔에 얼음과 흰 우유를 담아요. 우유가 얼음 사이를 채우고, 잔 위쪽 1/3은 비워 둬요.', 'On the wooden bar, white milk fills the spaces between the ice cubes. The upper third of the clear glass is empty.'),
      ].join('\n'),
      highlight: [
        t('첫 1초, 가느다란 에스프레소 줄기가 우유 위로 살짝 드러난 얼음 모서리에 닿아요. 그 얼음이 기울며 작은 파문이 생겨요.', 'In the first second, a thin espresso stream hits an exposed corner of ice. That cube tips and sends a ripple across the milk.'),
        t('그 얼음 바로 아래, 흰 우유 속으로 갈색 선 두 갈래가 번지는 순간을 가까이 보여주세요.', 'Stay close as two brown trails spread through the white milk just beneath that cube.'),
      ].join('\n'),
      shots: [
        t('잔 옆면을 가까이 잡아 우유 표면과 잔 입구를 한 화면에 담아요. 첫 에스프레소 줄기가 얼음을 건드리는 순간부터 시작해요.', 'Frame the milk surface and the rim together from the side. Open the instant the stream touches the ice.'),
        t('화면을 끊지 않고 기울어진 얼음 아래로 초점을 옮겨요. 갈색 줄기가 얼음 양옆을 타고 내려와 두 갈래로 퍼지고, 가장자리부터 연갈색으로 풀려요.', 'Stay in the shot and shift focus just below the tilted cube. Espresso runs down both sides in two trails that soften to tan at the edges.'),
        t('붓는 동안 우유 표면이 조금씩 올라와요. 잔 입구 아래에 여유를 남기고 붓기를 멈춘 뒤, 카메라가 물러나 원목 바 위 완성된 한 잔을 담아요.', 'Let the liquid rise with the pour. Stop while a gap remains below the rim, then pull back to the finished drink on the wooden bar.'),
      ],
    };
  }
  if (value.style === 'unboxing') {
    return {
      description: [
        t('겨울 롱패딩이 담긴 상자를 창가의 밝은 테이블에 놓아요.', 'Set the box containing the winter puffer on a bright table by the window.'),
        t('뚜껑 안쪽에는 검은 후드가 먼저 보이고, 접힌 옷 옆으로 주머니 지퍼가 보여요.', 'The black hood is visible first under the lid, with a pocket zip alongside the folded coat.'),
      ].join('\n'),
      highlight: [
        t('첫 1초, 뚜껑이 들리는 좁은 틈으로 검은 후드가 보이게 해주세요.', 'In the first second, reveal the black hood through the narrow opening under the lid.'),
        t('접힌 패딩이 펼쳐질 때 무릎까지 오는 길이가 한눈에 드러나면 좋아요.', 'Show the coat unfolding until its full knee-length cut is clear.'),
      ].join('\n'),
      shots: [
        t('닫힌 상자의 뚜껑 가장자리에 초점을 맞춰요. 화면 밖에서 뚜껑을 열면 틈으로 빛이 들어가 후드의 검은 원단을 비춰요.', 'Focus on the edge of the lid. As it opens from outside the frame, light slips through the gap onto the black hood.'),
        t('카메라가 열린 상자 안으로 다가가요. 접힌 후드에서 옆주머니 지퍼까지 초점을 옮겨요.', 'Move closer to the open box and shift focus from the folded hood to the side-pocket zip.'),
        t('테이블 위에 같은 패딩을 길게 펼쳐 놓은 모습으로 이어져요. 위에서 후드와 긴 밑단, 옆에 놓인 열린 상자까지 함께 담아요.', 'Cut to the same coat laid out on the table. From above, frame the hood, long hem and open box alongside it.'),
      ],
    };
  }
  if (value.style === 'presenter') {
    return {
      description: [
        t('눈 오는 아침, 출근 전에 현관 거울 앞에서 검은 겨울 롱패딩을 입어 봐요.', 'On a snowy morning I try on the black winter puffer at the hall mirror before work.'),
        t('후드를 쓰고 옆주머니에 교통카드를 넣어요. 옆으로 서면 밑단이 무릎에 닿아요.', 'I pull up the hood and slip my transit card into the side pocket. From the side the hem reaches my knees.'),
      ].join('\n'),
      highlight: [
        t('첫 1초, 교통카드가 주머니에 쏙 들어가고 지퍼가 닫히는 소리를 가까이 담아주세요.', 'In the first second, catch the transit card slipping into the pocket and the sound of the zip closing.'),
        t('거울 앞에서 반 바퀴 돌아 옆선과 실제 착용 길이를 보여주세요.', 'Follow my half turn in the mirror to show the side seam and where the hem sits.'),
      ].join('\n'),
      shots: [
        t('휴대폰 화면 가득 옆주머니를 잡아요. 카드 끝이 사라지는 순간 손이 지퍼를 끝까지 당겨요.', 'Fill the phone frame with the side pocket. As the card disappears, the wearer pulls the zip shut.'),
        t('같은 사람이 거울을 향해 한 걸음 물러나 후드를 써요. 거울에 후드부터 무릎까지 들어와요.', 'Follow the wearer stepping back and pulling up the hood, until the mirror shows the coat from hood to knees.'),
        t('옆으로 돌아 현관문 쪽으로 한 걸음 내디뎌요. 걸음에 맞춰 긴 밑단이 움직이는 모습으로 끝내요.', 'End with a side view as the wearer steps toward the door and the long hem moves with their stride.'),
      ],
    };
  }
  return {
    description: [
      t('첫눈 오는 아침, 버스 정류장의 노란 불빛 아래 검은 후드에 눈이 내려앉아요.', 'Early snow settles on a black hood in the amber light of a bus shelter.'),
      t('검은색 롱패딩은 후드에서 무릎까지 이어져요. 양옆 지퍼 주머니와 긴 옆선이 보이도록 정류장 유리벽 앞에 걸어 두어요.', 'Hang the knee-length black puffer in front of the glass shelter so both zip pockets and its long side seam are visible.'),
    ].join('\n'),
    highlight: [
      t('첫 1초, 후드에 쌓인 눈가루가 한꺼번에 흩어지며 검은 원단이 드러나요.', 'In the first second, a gust scatters the powder on the hood and reveals black fabric.'),
      t('눈가루 뒤로 지퍼가 빛을 받는 순간을 잡고, 마지막엔 후드부터 밑단까지 한 화면에 담아주세요.', 'Catch the light on the zip behind the powder, then finish with hood and hem in the same frame.'),
    ].join('\n'),
    shots: [
      t('버스 불빛이 비치는 후드를 바짝 당겨 잡아요. 바람에 흰 눈가루가 흩어지고 그 사이로 버스 전조등이 드러나요.', 'Frame the hood tight in the bus lights. A gust scatters the white powder and reveals the headlights behind it.'),
      t('옆주머니 지퍼에 걸린 가느다란 빛을 따라가요. 초점을 지퍼에서 검은 원단의 봉제선으로 옮겨요.', 'Follow a sliver of light along the pocket zip, then shift focus to the stitching in the black fabric.'),
      t('카메라가 물러나 유리벽 앞에 걸린 롱패딩 전체를 담아요. 바람에 긴 밑단이 한 번 들렸다 가라앉아요.', 'Pull back to the whole coat against the glass. Its long hem lifts once in the breeze and settles.'),
    ],
  };
}

export function VideoBriefFields({value,disabled,change}:{value:VideoBrief;disabled:boolean;change:(v:VideoBrief)=>void}){
  const {t}=useUiLanguage();
  const service=value.kind==='service';
  const {description,highlight,shots} = briefExample(value,t);
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
