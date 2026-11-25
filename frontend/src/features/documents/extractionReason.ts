/** 본문 확보(extractionReason) 서버 코드를 사용자용 한국어로 바꾼다. 코드가 아닌 문장이면 그대로 쓴다. */
const labels: Record<string, string> = {
  LOGIN_OR_PAYWALL: '로그인이나 유료 구독이 필요한 페이지라 본문을 읽지 못했습니다.',
  UNSAFE_OR_INVALID_URL: '안전하지 않거나 올바르지 않은 주소라 본문을 요청하지 않았습니다.',
  UNSAFE_URL: '안전하지 않은 주소라 본문을 요청하지 않았습니다.',
  PARSE_FAILED: '페이지 구조를 해석하지 못해 본문을 추출하지 못했습니다.',
  TEXT_TOO_LARGE: '본문이 너무 길어 저장하지 않았습니다.',
  BODY_TOO_LARGE: '페이지 용량이 너무 커서 본문을 가져오지 않았습니다.',
  NO_READABLE_BODY: '페이지에서 읽을 수 있는 본문을 찾지 못해 검색 요약만 저장했습니다.',
  FETCH_FAILED: '페이지를 불러오지 못했습니다.',
  FETCH_TIMEOUT: '페이지 응답 시간이 초과되었습니다.',
  NOT_HTML: '일반 웹 문서(HTML)가 아니라 본문을 추출하지 않았습니다.',
  TOO_MANY_REDIRECTS: '페이지 이동(리디렉션)이 너무 많아 중단했습니다.',
  INVALID_REDIRECT: '허용되지 않는 주소로 이동하려 해 중단했습니다.',
  REDIRECT: '다른 주소로 이동하는 페이지라 본문을 가져오지 않았습니다.',
  HTTPS_DOWNGRADE: '보안 연결(HTTPS)이 해제되는 이동이라 중단했습니다.',
  UNSUPPORTED_ENCODING: '지원하지 않는 문자 인코딩이라 본문을 읽지 못했습니다.',
  FETCH_ON_APPLY: '본문 수집이 허용된 출처입니다. 공개 본문 탭에서 가져올 수 있습니다.',
  NO_BODY_REQUEST: '본문 자동 수집 대상으로 승인되지 않은 출처라 검색 요약만 저장했습니다.',
  POLICY_NOT_APPROVED: '본문 자동 수집 대상으로 승인되지 않은 출처입니다.',
  SERPER_SCRAPE: 'Serper 본문 추출로 공개 본문을 확보했습니다.',
  USER_PROVIDED: '원문에서 직접 복사해 붙여 넣은 본문입니다.',
  SCRAPE_UNAVAILABLE: 'Serper 본문 추출을 사용할 수 없습니다(키·승인 설정 확인).',
  SCRAPE_FAILED: 'Serper 본문 추출 요청이 실패했습니다.',
  SCRAPE_INVALID_RESPONSE: 'Serper 본문 추출 응답을 해석하지 못했습니다.',
  BUDGET_EXHAUSTED: '오늘의 Serper 호출 상한을 모두 사용했습니다. 내일 다시 시도하거나 본문을 직접 붙여 넣으세요.',
  PROVIDER_COOLDOWN: 'Serper 요청 제한으로 잠시 대기 중입니다. 잠시 후 다시 시도하세요.',
  PROVIDER_RATE_LIMIT: 'Serper 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요.',
  PROVIDER_AUTH: 'Serper API 키 인증에 실패했습니다.',
  PROVIDER_TIMEOUT: 'Serper 응답 시간이 초과되었습니다.',
};

const codePattern = /^[A-Z][A-Z0-9_]+$/;

/** text: 화면 문구, code: 원래 서버 코드(코드 형태일 때만, details에 표시용). */
export function describeExtractionReason(reason: string | null | undefined): { text: string; code: string | null } | null {
  if (!reason) return null;
  const value = reason.trim();
  if (!codePattern.test(value)) return { text: value, code: null };
  return { text: labels[value] ?? '본문 확보 과정에서 확인이 필요한 상태가 기록되었습니다.', code: value };
}
