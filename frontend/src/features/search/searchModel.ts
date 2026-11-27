/** 검색·수집 화면 전용 표시 규칙(상태 문구, 제공자명, 파이프라인 단계 판정). */
import type { Run } from '../../api/client';
import type { AiHealth, HistoryItem } from '../../api/queries';
import { aiHealthReason } from '../../api/queries';
import type { StepState, TagTone } from '../../components/ui';

/** 서버 Run 응답에는 startedAt/finishedAt이 있지만 공유 타입(client.ts)에는 아직 없어 화면에서만 확장한다. */
export type RunDetail = Run & { startedAt?: string | null; finishedAt?: string | null };

export const statusLabel: Record<Run['status'], string> = { QUEUED: '검색 대기 중', RUNNING: '자료 수집 중', SUCCEEDED: '수집 완료', PARTIAL: '일부 본문 확인 불가', FAILED: '검색 실패' };
export const statusChip: Record<Run['status'], { label: string; tone: TagTone }> = {
  QUEUED: { label: '대기', tone: 'gray' },
  RUNNING: { label: '수집 중', tone: 'purple' },
  SUCCEEDED: { label: '완료', tone: 'green' },
  PARTIAL: { label: '일부 본문 확인 불가', tone: 'orange' },
  FAILED: { label: '실패', tone: 'red' },
};
/** history.status는 문자열이라 알 수 없는 값은 그대로 보여 준다. */
export function historyStatusChip(status: string) {
  return statusChip[status as Run['status']] ?? { label: status, tone: 'gray' as TagTone };
}
export const reasonLabel: Record<string, string> = { PROVIDER_KEY_MISSING: '서버에 Serper API 키가 설정되지 않았습니다.', APPROVAL_REQUIRED: '외부 검색 호출 승인이 설정되지 않았습니다.', BUDGET_EXHAUSTED: '오늘의 Serper 호출 상한을 모두 사용했습니다. 자정(한국 시간)이 지나면 다시 채워집니다.', PROVIDER_COOLDOWN: '검색 제공자의 요청 제한 대기 중입니다. 잠시 후 연결 상태를 다시 확인하세요.' };

/** 검색 작업 errorCode → 사용자용 문장. 원래 코드는 화면의 '오류 정보' 안에만 둔다. (backend provider/*, search/*에서 확인한 코드) */
const errorText: Record<string, string> = {
  PROVIDER_UNAVAILABLE: '검색 제공자에 연결하지 못했습니다',
  PROVIDER_TIMEOUT: '검색 제공자의 응답 시간이 초과됐습니다',
  PROVIDER_RATE_LIMIT: '검색 제공자의 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요',
  PROVIDER_RATE_LIMITED: '검색 제공자의 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요',
  PROVIDER_COOLDOWN: '검색 제공자의 요청 제한 대기 중입니다',
  PROVIDER_AUTH: '검색 제공자 인증에 실패했습니다. 서버의 API 키를 확인하세요',
  PROVIDER_KEY_MISSING: '서버에 검색 API 키가 설정되지 않았습니다',
  PROVIDER_INVALID_RESPONSE: '검색 제공자의 응답 형식을 읽지 못했습니다',
  PROVIDER_REQUEST_LIMIT: '허용 범위를 벗어난 검색 요청입니다',
  APPROVAL_REQUIRED: '외부 검색 호출 승인이 설정되지 않았습니다',
  BUDGET_EXHAUSTED: '오늘의 Serper 호출 상한을 모두 사용했습니다',
  INTERRUPTED: '검색 작업이 중단됐습니다(서버 재시작 등)',
  PROCESSING_FAILED: '검색 결과를 저장하는 중 오류가 발생했습니다',
};
export function errorLabel(code: string | null | undefined): string {
  if (!code) return '';
  return errorText[code] ?? '알 수 없는 오류로 검색을 완료하지 못했습니다';
}

/** 검색 제공자 표시명. */
export function providerLabel(provider: string | undefined): string {
  if (provider === 'SERPER') return 'Serper';
  return provider || '제공자 미상';
}

/** ISO 시각의 KST 날짜(YYYY-MM-DD). 잘못된 값이면 undefined. */
export function kstDayOf(iso: string | null | undefined): string | undefined {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Date(time + 9 * 3600000).toISOString().slice(0, 10) : undefined;
}

/** /stats/history에서 이 검색 세션 항목을 찾은 결과. */
export type HistoryLookup =
  | { state: 'waiting' | 'loading' | 'missing' | 'error'; reason: string }
  | { state: 'found'; item: HistoryItem; reason: string };

export type Step = { key: string; title: string; description: string; state: StepState; meta?: string };

/** 실제 파이프라인(접수 → 제공자 수신 → 저장·분류·본문 확인 → 중복 정리 → 요청 시 AI 분석) 단계 상태. */
export function buildSteps(run: RunDetail, history: HistoryLookup, health: { data?: AiHealth; isError: boolean; isPending: boolean }): Step[] {
  const status = run.status;
  const finished = status === 'SUCCEEDED' || status === 'PARTIAL';
  const provider = providerLabel(run.provider);
  const item = history.state === 'found' ? history.item : undefined;
  // 실패한 작업은 history의 원시 수신(raw)이 기록됐는지로 어느 단계에서 멈췄는지 판단한다.
  const received = finished || (status === 'FAILED' && item?.raw != null);
  const failText = errorLabel(run.errorCode) || '검색을 완료하지 못했습니다';

  const receive: Step = {
    key: 'receive', title: `${provider} 검색 결과 수신`,
    description: status === 'FAILED' && !received ? failText : '검색어를 검색 제공자에 보내고 결과를 받습니다',
    state: status === 'QUEUED' ? 'waiting' : status === 'RUNNING' ? 'active' : received ? 'done' : 'error',
    meta: finished ? `발견 ${item?.raw ?? run.discoveredCount}건` : status === 'RUNNING' ? '수신 중' : status === 'FAILED' ? (received ? `원시 ${item?.raw}건` : '실패') : '대기',
  };
  const store: Step = {
    key: 'store', title: '자료 저장·출처 분류·본문 확인',
    description: status === 'FAILED' && received ? failText : status === 'PARTIAL' ? '일부 자료는 본문을 확인하지 못해 검색 요약과 원문 링크만 저장했습니다' : '결과를 저장하고 공식·사용자·기타로 분류한 뒤 본문 확보 여부를 확인합니다',
    state: finished ? 'done' : status === 'FAILED' && received ? 'error' : 'waiting',
    meta: finished ? `저장 ${run.processedCount} · 본문 확인 불가 ${run.failureCount}` : status === 'FAILED' && received ? '실패' : status === 'FAILED' ? '진행 안 됨' : '대기',
  };
  const dedupe: Step = {
    key: 'dedupe', title: '중복 정리',
    description: '이미 저장된 자료와 같은 결과를 하나로 묶습니다',
    state: finished ? 'done' : 'waiting',
    meta: !finished ? (status === 'FAILED' ? '진행 안 됨' : '대기')
      : item ? `신규 ${item.created} · 기존 ${item.existing} · 중복 ${item.duplicates}`
        : history.state === 'loading' ? '집계 조회 중' : '집계 없음',
  };
  const aiMeta = health.data
    ? health.data.available ? `Ollama 연결됨${health.data.model ? ` · ${health.data.model}` : ''}` : `Ollama 연결 안 됨 · ${aiHealthReason(health.data.code)}`
    : health.isError ? 'Ollama 상태 확인 불가' : '상태 확인 중';
  return [
    { key: 'accept', title: '검색 요청 접수', description: status === 'QUEUED' ? '요청을 받았고 실행 순서를 기다리고 있습니다' : '서버가 검색 요청을 받았습니다', state: status === 'QUEUED' ? 'active' : 'done', meta: `세션 #${run.runId}` },
    receive, store, dedupe,
    { key: 'ai', title: 'Ollama 구조화 분석', description: '자동 실행하지 않습니다. 자료 상세에서 요청하면 순차 처리합니다', state: 'waiting', meta: aiMeta },
  ];
}
