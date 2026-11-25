import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { request } from '../../api/client';
import { Card, Skeleton, Tag } from '../../components/ui';
import { formatKstDateTime } from '../../lib/format';
import { historyStatusChip, providerLabel } from './searchModel';
import type { RunDetail } from './searchModel';
import { useRecentHistory } from './useRunHistory';

/** 검색 전 화면의 최근 검색 이력(최근 30일, 최신 5건). 검색어는 이력 응답에 없어 세션 조회(Run.query)로 채우고, 실패하면 주제명만 보여 준다. */
export function RecentSearches() {
  const history = useRecentHistory();
  const items = history.data?.items.slice(0, 5) ?? [];
  const runs = useQueries({
    queries: items.map(item => ({
      queryKey: ['search-run', item.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => request<RunDetail>(`/search-sessions/${item.id}`, undefined, signal),
      retry: false,
    })),
  });
  return <Card className="search-recent-card" title="최근 검색 이력" aside="최근 30일">
    {history.isPending && <><p className="visually-hidden" role="status">최근 검색 이력을 불러오는 중</p><Skeleton lines={3} /></>}
    {history.isError && <div role="alert" className="search-recent-error">
      <p>최근 검색 이력을 불러오지 못했습니다. {history.error.message}</p>
      <button type="button" className="button-secondary" disabled={history.isFetching} onClick={() => { void history.refetch(); }}>다시 시도</button>
    </div>}
    {history.data && !items.length && <p className="form-help">최근 30일 동안 실행한 검색이 없습니다.</p>}
    {items.length > 0 && <ul className="search-recent-list">
      {items.map((item, index) => {
        const chip = historyStatusChip(item.status);
        const query = runs[index]?.data?.query;
        return <li key={item.id}>
          <Link to={`/search?runId=${item.id}`} className="search-recent-link">
            <span className="search-recent-top"><strong>{query ?? item.topic}</strong><Tag tone={chip.tone}>{chip.label}</Tag></span>
            <span className="search-recent-meta">{query ? `${item.topic} · ` : ''}세션 #{item.id} · {providerLabel(item.provider)} · {formatKstDateTime(item.startedAt)} · 신규 {item.created}건</span>
          </Link>
        </li>;
      })}
    </ul>}
    {history.data && history.data.total > items.length && <p className="form-help">전체 {history.data.total}건 중 최신 {items.length}건 · <Link className="text-link" to="/stats">주제 분석에서 전체 이력 보기 →</Link></p>}
  </Card>;
}
