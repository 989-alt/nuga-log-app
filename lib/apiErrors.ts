/** 제공자 오류 상태 코드를 교사가 이해할 수 있는 안내로 바꾼다. `/api/chat`·`/api/generate`가 공유한다. */
export function messageForStatus(status: number, retryAfterSec?: number): string {
  if (status === 429) {
    const when = retryAfterSec ? `약 ${retryAfterSec}초 뒤` : '잠시 후';
    return `요청 한도(429)에 도달했습니다. 무료 등급 키는 분당 요청 수가 제한됩니다. ${when} 다시 시도하거나, "생성 엔진"의 속도/품질을 낮추고 정밀 모드를 끄면 요청 수가 줄어 한도에 덜 걸립니다. 자주 쓰신다면 결제가 설정된 키를 권장합니다.`;
  }
  if (status === 401 || status === 403)
    return `API 키가 유효하지 않습니다(${status}). 키를 다시 확인해 주세요.`;
  if (status === 404)
    return '선택한 모델을 찾을 수 없습니다(404). "모델 목록 불러오기"에서 사용 가능한 모델을 골라 주세요.';
  if (status === 400)
    return '요청이 거부되었습니다(400). 모델명이 올바른지 확인해 주세요.';
  return `생성 제공자 오류가 발생했습니다(${status}). 잠시 후 다시 시도해 주세요.`;
}
