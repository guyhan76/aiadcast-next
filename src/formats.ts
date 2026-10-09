// Output presets for the final composition, independent of a provider's native sizes.
// Placement names are use examples, not a claim that every ad placement accepts them.
export const imageFormats = [
 {id:'1:1',width:1080,height:1080,name:'정사각형',use:'SNS 피드 · 상품 소개',description:'인스타그램·페이스북 피드와 정사각형 상품 소개 이미지에 활용하세요.'},
 {id:'4:5',width:1080,height:1350,name:'피드 세로형',use:'인스타그램 · 페이스북 피드',description:'모바일 피드에서 상품 사진과 홍보 문구를 세로로 배치할 때 추천합니다.'},
 {id:'3:4',width:1080,height:1440,name:'상품 세로형',use:'세로 상품 소개 · 카탈로그',description:'제품 정보와 사진을 함께 담는 세로 콘텐츠·카탈로그 이미지에 활용하세요.'},
 {id:'9:16',width:1080,height:1920,name:'전체 화면 세로형',use:'스토리 · 릴스·쇼츠용 소재',description:'스토리와 세로 영상용 이미지 소재에 활용하세요. PNG로 저장되며 릴스·쇼츠 영상은 별도 제작이 필요합니다.'},
 {id:'2:3',width:1080,height:1620,name:'포스터 세로형',use:'세로 포스터 · 핀터레스트',description:'상품 홍보 포스터와 핀터레스트 핀 등 세로 이미지에 활용하세요.'},
 {id:'16:9',width:1920,height:1080,name:'와이드 가로형',use:'웹 배너 · 영상 썸네일',description:'홈페이지의 가로 홍보 영역과 유튜브 등 영상 썸네일에 활용하세요.'},
 {id:'1.91:1',width:1200,height:628,name:'링크 광고 가로형',use:'링크 광고 · 가로 배너',description:'페이스북 링크 광고 등의 가로 소재에 활용하세요. 1200 × 628 px는 약 1.91:1의 표준 크기입니다.'},
] as const;
export type ImageFormat = typeof imageFormats[number]['id'];
export function isImageFormat(value:unknown):value is ImageFormat {
 return imageFormats.some(format=>format.id===value);
}
export function getImageFormat(value:ImageFormat) {
 const format=imageFormats.find(format=>format.id===value);
 if(!format)throw new Error('지원하지 않는 이미지 비율입니다.');
 return format;
}
