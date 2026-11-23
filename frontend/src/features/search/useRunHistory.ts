import { useQuery } from '@tanstack/react-query';
import { activeRun, request } from '../../api/client';
import { fetchAllHistory } from '../../api/queries';
import type { HistoryPage } from '../../api/queries';
import { kstDayOf } from './searchModel';
import type { HistoryLookup, RunDetail } from './searchModel';

/**
 * 끝난 검색 세션의 /stats/history 항목(id === runId)을 찾는다.
 * 기간은 작업 시작일(KST) 하루, 주제는 이 세션의 주제로 좁힌다. 시작 시각이 없으면 서버 기본 기간(최근 30일)으로 찾는다.
 */
export function useRunHistory(run: RunDetail | undefined) {
  const scope = new URLSearchParams();
  if (run) {
    scope.set('topicId', String(run.topicId));
    const day = kstDayOf(run.startedAt);
    if (day) { scope.set('from', day); scope.set('to', day); }
  }
  const finished = Boolean(run) && !activeRun(run);
  const history = useQuery({
    queryKey: ['stats', 'history', 'all', scope.toString()],
    queryFn: ({ signal }) => fetchAllHistory(scope, 20, signal),
    enabled: finished, retry: false,
  });
  const item = run ? history.data?.items.find(entry => entry.id === run.runId) : undefined;
  let lookup: HistoryLookup;
  if (!run || !finished) lookup = { state: 'waiting', reason: '검색이 끝나면 저장 이력에서 집계합니다.' };
  else if (item) lookup = { state: 'found', item, reason: '검색 이력의 이 세션 집계입니다.' };
  else if (history.isPending) lookup = { state: 'loading', reason: '검색 이력에서 이 세션 집계를 찾는 중입니다.' };
  else if (history.isError) lookup = { state: 'error', reason: `검색 이력을 불러오지 못했습니다. ${history.error.message}` };
  else if (history.data?.truncated) lookup = { state: 'missing', reason: '같은 날 검색 이력이 많아 조회 상한 안에서 이 세션을 찾지 못했습니다.' };
  else lookup = { state: 'missing', reason: '검색 이력에서 이 세션 항목을 찾지 못했습니다.' };
  return { lookup, refetch: () => { void history.refetch(); }, isFetching: history.isFetching };
}

/** 최근 검색 이력 첫 페이지(서버 기본 기간 최근 30일). 검색 전 화면의 안내 문구와 목록이 함께 쓴다. */
export function useRecentHistory() {
  return useQuery({
    queryKey: ['stats', 'history', 'recent'],
    queryFn: ({ signal }) => request<HistoryPage>('/stats/history?page=0', undefined, signal),
    retry: false,
  });
}
