/** 주제 분석 화면의 순수 계산 함수. 모든 값은 /api/stats, /api/stats/history 응답에서만 계산한다. */
import type { HistoryItem, StatsOverview } from '../../api/queries';

const DAY = 86400000;
const KST_OFFSET = 9 * 3600000;

export type AllHistory = { items: HistoryItem[]; total: number; truncated: boolean };
export type FlowSeries = 'searches' | 'created' | 'duplicates';
export type FlowRow = { date: string; searches: number; created: number; duplicates: number };

export const seriesLabel: Record<FlowSeries, string> = { searches: '검색 횟수', created: '처음 저장한 자료', duplicates: '중복 자료' };
export const seriesUnit: Record<FlowSeries, string> = { searches: '회', created: '건', duplicates: '건' };

/** ISO 시각(UTC)의 KST 날짜. 잘못된 값이면 undefined. */
export function kstDayOf(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time + KST_OFFSET).toISOString().slice(0, 10) : undefined;
}

/** from~to(양 끝 포함) 날짜 목록. 최대 366일. */
export function dateRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const days: string[] = [];
  for (let time = start; time <= end && days.length < 366; time += DAY) days.push(new Date(time).toISOString().slice(0, 10));
  return days;
}

/** 이력 전체 합산. raw가 null(미기록)인 작업은 원시 합계에서 빼고 개수를 따로 센다. */
export function sumHistory(items: HistoryItem[]) {
  let raw = 0, rawMissing = 0, created = 0, duplicates = 0;
  for (const item of items) {
    if (item.raw === null || item.raw === undefined) rawMissing++; else raw += item.raw;
    created += item.created;
    duplicates += item.duplicates;
  }
  return { raw, rawMissing, created, duplicates };
}

/** SUCCEEDED/PARTIAL 작업 중 가장 늦은 finishedAt. 없으면 undefined. */
export function lastSuccessAt(items: HistoryItem[]): string | undefined {
  let best: string | undefined, bestTime = -Infinity;
  for (const item of items) {
    if (item.status !== 'SUCCEEDED' && item.status !== 'PARTIAL') continue;
    const time = item.finishedAt ? Date.parse(item.finishedAt) : NaN;
    if (Number.isFinite(time) && time > bestTime) { bestTime = time; best = item.finishedAt ?? undefined; }
  }
  return best;
}

/**
 * 선택 기간 일별 자료 흐름. 0건 날짜도 포함한다.
 * 검색 횟수·중복 자료 = 이력의 작업 시작 시각(KST) 기준, 처음 저장한 자료 = overview.daily(처음 저장일 기준).
 */
export function buildFlow(from: string, to: string, overview: StatsOverview | undefined, history: HistoryItem[] | undefined): FlowRow[] {
  const rows = new Map(dateRange(from, to).map(date => [date, { date, searches: 0, created: 0, duplicates: 0 }]));
  for (const day of overview?.daily ?? []) {
    const row = rows.get(day.date);
    if (row) row.created = day.count;
  }
  for (const item of history ?? []) {
    const row = rows.get(kstDayOf(item.startedAt) ?? '');
    if (!row) continue;
    row.searches += 1;
    row.duplicates += item.duplicates;
  }
  return [...rows.values()];
}

/** 검색 제공자 내부 이름(SERPER 등)을 사용자용 이름으로. */
export function providerLabel(provider: string): string {
  if (provider === 'SERPER') return '실제 검색 · Serper';
  return '실제 검색';
}

/** 검색 작업 오류 코드(backend search/provider)의 사용자용 설명. 원래 코드는 상세 영역에만 표시한다. */
const errorText: Record<string, string> = {
  PROVIDER_TIMEOUT: '검색 제공자 응답이 제한 시간 안에 오지 않았습니다.',
  PROVIDER_UNAVAILABLE: '검색 제공자에 연결할 수 없었습니다.',
  PROVIDER_INVALID_RESPONSE: '검색 제공자 응답 형식을 해석할 수 없었습니다.',
  PROVIDER_RATE_LIMIT: '검색 제공자의 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요.',
  PROVIDER_REQUEST_LIMIT: '허용 범위를 벗어난 검색 요청이었습니다.',
  PROVIDER_AUTH: '검색 제공자 인증에 실패했습니다(API 키 확인 필요).',
  PROVIDER_KEY_MISSING: '서버에 검색 API 키가 설정되지 않았습니다.',
  PROVIDER_COOLDOWN: '검색 제공자 요청 제한 대기 중이었습니다.',
  APPROVAL_REQUIRED: '외부 검색 호출 승인이 설정되지 않았습니다.',
  BUDGET_EXHAUSTED: '오늘의 Serper 호출 상한을 모두 사용했습니다.',
  QUEUE_FULL: '검색 대기열이 가득 차 처리하지 못했습니다.',
  INTERRUPTED: '서버 재시작 등으로 처리가 중단되었습니다.',
  PROCESSING_FAILED: '검색 결과를 처리하는 중 오류가 발생했습니다.',
};
export function errorLabel(code: string | null): string {
  if (!code) return '실패 사유가 기록되지 않았습니다.';
  return errorText[code] ?? '알 수 없는 오류로 완료되지 못했습니다.';
}

export function isRunning(items: HistoryItem[] | undefined) {
  return Boolean(items?.some(item => item.status === 'RUNNING' || item.status === 'QUEUED'));
}
