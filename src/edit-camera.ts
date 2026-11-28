// The selected view is an editable first line of the ordinary instruction.
// Saved projects, retries and older clients can all use the same request format.
export const cameraViews = [
  {id:'front', ko:'정면', en:'Front', koText:'카메라를 피사체 앞으로 옮겨 정면에서 본 장면으로 바꿔주세요.', enText:'Move the camera in front of the subject for a front view.'},
  {id:'side', ko:'측면', en:'Side', koText:'카메라를 피사체 옆으로 옮겨 측면에서 본 장면으로 바꿔주세요.', enText:'Move the camera beside the subject for a side view.'},
  {id:'rear', ko:'후면', en:'Rear', koText:'카메라를 피사체 뒤로 옮겨 뒤에서 본 장면으로 바꿔주세요.', enText:'Move the camera behind the subject for a rear view.'},
  {id:'threeQuarter', ko:'앞쪽 45도', en:'Front three-quarter', koText:'카메라를 피사체의 앞쪽 45도 위치로 옮겨 비스듬히 본 장면으로 바꿔주세요.', enText:'Move the camera to a front three-quarter view of the subject.'},
  {id:'high', ko:'위에서 내려다보기', en:'High angle', koText:'카메라를 피사체보다 높은 곳으로 옮겨 비스듬히 내려다본 장면으로 바꿔주세요.', enText:'Move the camera above the subject and look diagonally down.'},
  {id:'low', ko:'아래에서 올려다보기', en:'Low angle', koText:'카메라를 피사체보다 낮은 곳으로 옮겨 올려다본 장면으로 바꿔주세요.', enText:'Move the camera below the subject and look up.'},
  {id:'overhead', ko:'수직 탑뷰', en:'Directly overhead', koText:'카메라를 피사체 바로 위로 옮겨 수직으로 내려다본 장면으로 바꿔주세요.', enText:'Move the camera directly overhead for a top-down view.'}
] as const;

export function selectedCameraView(prompt:string) {
  const firstLine=prompt.split('\n',1)[0].trim();
  return cameraViews.find(view=>view.koText===firstLine||view.enText===firstLine);
}

export function replaceCameraView(prompt:string,instruction:string) {
  const notes=selectedCameraView(prompt)?prompt.split('\n').slice(1).join('\n'):prompt;
  return [instruction,notes].filter(Boolean).join('\n');
}
