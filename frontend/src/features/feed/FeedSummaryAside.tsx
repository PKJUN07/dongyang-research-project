import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { request } from '../../api/client';
import type { RunStatus } from '../../api/client';
import type { HistoryPage } from '../../api/queries';
import { Card, Notice, ProgressBar, Skeleton, StatTile, Tag } from '../../components/ui';
import { formatKstDateTime, kstDate } from '../../lib/format';
import { runStatusLabel } from './feedUtils';

/** 오른쪽 열: 가장 최근 검색 작업의 신규·중복 수, 현재 페이지 AI 분석 완료 비율, AI/원문 분리 안내. */
export function FeedSummaryAside({ readyCount, pageCount, readinessState }: {
  readyCount: number; pageCount: number; readinessState: 'pending' | 'error' | 'list-error' | 'ready' | 'empty';
}) {
  const from = kstDate(-29);
  const to = kstDate(0);
  const history = useQuery({
    queryKey: ['stats', 'history', 'feed-latest', from, to],
    queryFn: ({ signal }) => request<HistoryPage>(`/stats/history?from=${from}&to=${to}&page=0`, undefined, signal),
    retry: false,
  });
  const latest = history.data?.items[0];

  let historyBody;
  if (history.isPending) {
    historyBody = <><p className="visually-hidden" role="status">최근 검색 기록을 불러오는 중입니다.</p><Skeleton lines={2} /></>;
  } else if (history.isError && !history.data) {
    historyBody = (
      <div className="feed-inline-alert" role="alert">
        <span>최근 검색 기록을 불러오지 못했습니다.</span>
        <button type="button" className="button-secondary" onClick={() => { void history.refetch(); }}>다시 시도</button>
      </div>
    );
  } else if (!latest) {
    historyBody = <p className="feed-aside-empty">최근 30일 동안 실행한 검색이 없습니다. <Link className="text-link" to="/search">새 자료 검색 →</Link></p>;
  } else {
    historyBody = (
      <>
        <p className="feed-aside-run">
          <span className="feed-aside-topic">{latest.topic}</span>
          <span>{formatKstDateTime(latest.startedAt)} · {runStatusLabel[latest.status as RunStatus] ?? latest.status}</span>
          {latest.synthetic && <Tag tone="orange">테스트 검색</Tag>}
        </p>
        <div className="grid-2 feed-aside-tiles">
          <StatTile label="신규 고유" value={latest.created} tone="green" />
          <StatTile label="확정 중복" value={latest.duplicates} tone="orange" />
        </div>
        {history.isRefetchError && <p className="feed-inline-alert" role="alert">최신 기록으로 갱신하지 못해 이전 값을 표시합니다.</p>}
      </>
    );
  }

  let progress;
  if (readinessState === 'pending') progress = <p className="feed-aside-note" role="status">AI 분석 상태를 확인하는 중입니다.</p>;
  else if (readinessState === 'error') progress = <p className="feed-aside-note" role="alert">AI 분석 상태를 불러오지 못했습니다.</p>;
  else if (readinessState === 'list-error') progress = <p className="feed-aside-note">피드 목록을 불러오지 못해 분석 진행률을 표시할 수 없습니다.</p>;
  else if (readinessState === 'empty') progress = <p className="feed-aside-note">현재 페이지에 자료가 없어 분석 진행률을 표시하지 않습니다.</p>;
  else progress = (
    <>
      <ProgressBar value={readyCount} max={pageCount} label={`Ollama 분석 완료 ${readyCount} / ${pageCount}건`} />
      <p className="feed-aside-note">기준: 현재 피드 페이지 자료 {pageCount}건 중 최신 AI 분석이 있는 자료 수</p>
    </>
  );

  return (
    <aside className="stack" aria-label="피드 요약">
      <Card title="검색 결과 요약" aside="최근 30일 · 마지막 검색">
        <div className="feed-aside-body">
          {historyBody}
          <div className="feed-aside-progress">{progress}</div>
          <Link className="text-link" to="/stats">주제 분석에서 검색 이력 보기 →</Link>
        </div>
      </Card>
      <Notice title="AI와 원문을 분리했습니다.">
        <p>주제 브리프는 참고 자료를 재정리한 결과이며 실제 기사나 논문이 아닙니다.</p>
      </Notice>
    </aside>
  );
}
