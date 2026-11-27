import { Link } from 'react-router-dom';
import { Card, Skeleton, Tag } from '../../components/ui';
import { formatKstDateTime } from '../../lib/format';
import { historyStatusChip, providerLabel } from './searchModel';
import { useRecentHistory } from './useRunHistory';
import { DeleteRunButton } from '../stats/DeleteRunButton';

/** 검색 전 화면의 최근 검색 이력(최근 30일, 최신 5건). 검색한 문장을 그대로 제목으로 보여 준다. */
export function RecentSearches() {
  const history = useRecentHistory();
  const items = history.data?.items.slice(0, 5) ?? [];
  return <Card className="search-recent-card" title="최근 검색 이력" aside="최근 30일">
    {history.isPending && <><p className="visually-hidden" role="status">최근 검색 이력을 불러오는 중</p><Skeleton lines={3} /></>}
    {history.isError && <div role="alert" className="search-recent-error">
      <p>최근 검색 이력을 불러오지 못했습니다. {history.error.message}</p>
      <button type="button" className="button-secondary" disabled={history.isFetching} onClick={() => { void history.refetch(); }}>다시 시도</button>
    </div>}
    {history.data && !items.length && <p className="form-help">최근 30일 동안 실행한 검색이 없습니다.</p>}
    {items.length > 0 && <ul className="search-recent-list">
      {items.map(item => {
        const chip = historyStatusChip(item.status);
        const query = item.query.trim() || item.topic;
        return <li key={item.id} className="search-recent-item">
          <Link to={`/search?runId=${item.id}`} className="search-recent-link">
            <span className="search-recent-top"><strong>{query}</strong><Tag tone={chip.tone}>{chip.label}</Tag></span>
            <span className="search-recent-meta">{item.topic !== '빠른 검색' ? `${item.topic} · ` : ''}{providerLabel(item.provider)} · {formatKstDateTime(item.startedAt)} · 신규 {item.created}건</span>
          </Link>
          <DeleteRunButton runId={item.id} query={query} active={item.status === 'QUEUED' || item.status === 'RUNNING'} />
        </li>;
      })}
    </ul>}
    {history.data && history.data.total > items.length && <p className="form-help">전체 {history.data.total}건 중 최신 {items.length}건 · <Link className="text-link" to="/stats">주제 분석에서 전체 이력 보기 →</Link></p>}
  </Card>;
}
