import { Link } from 'react-router-dom';
import { ApiError, sourceLabel } from '../../api/client';
import { parseAiResult } from '../../api/queries';
import { Skeleton, Tag } from '../../components/ui';
import { formatKstDateTime, sourceTone } from '../../lib/format';
import type { LastBrief } from './feedUtils';

/** 'AI 주제 브리프' = 최근 만든 자료 요약 모음 스냅샷. 출처별 요약을 따로 보여 주고 하나의 결론으로 합치지 않는다. */
export function FeedBriefCard({ lastBrief, detailSearch, includeSynthetic, hiddenSyntheticCount, onIncludeSynthetic }: {
  lastBrief: LastBrief; detailSearch: string; includeSynthetic: boolean;
  /** 합성 제외 상태에서 이 모음에 포함된 합성 자료 수(모르면 0). */
  hiddenSyntheticCount: number; onIncludeSynthetic: () => void;
}) {
  const { briefId, query: brief } = lastBrief;
  const syntheticQuery = includeSynthetic ? 'includeSynthetic=true' : '';
  const briefLink = (id?: number) => {
    const search = [id ? `briefId=${id}` : '', syntheticQuery].filter(Boolean).join('&');
    return search ? `/brief?${search}` : '/brief';
  };
  const notFound = brief.error instanceof ApiError && brief.error.status === 404;

  const header = (
    <div className="feed-brief-header">
      <h2 className="feed-brief-title" id="feed-brief-title">AI 주제 브리프</h2>
      <div className="feed-brief-badges">
        <Tag tone="purple">AI 생성</Tag>
        {brief.data && <span className="feed-brief-badge">자료 {brief.data.snapshot.length}건 · 생성 {formatKstDateTime(brief.data.createdAt)}</span>}
      </div>
    </div>
  );

  let body;
  if (briefId === null || notFound) {
    body = (
      <div className="feed-brief-empty">
        <p><strong>아직 만든 자료 요약 모음이 없습니다.</strong></p>
        <p>AI 분석을 마친 자료를 최대 5개 골라 요약 모음을 만들면 이곳에 출처별 요약이 표시됩니다.</p>
        <Link className="button-link-secondary" to={briefLink()}>자료 요약 모음 만들기</Link>
      </div>
    );
  } else if (brief.isPending) {
    body = <><p className="visually-hidden" role="status">자료 요약 모음을 불러오는 중입니다.</p><Skeleton lines={4} /></>;
  } else if (brief.isError) {
    body = (
      <div className="feed-inline-alert" role="alert">
        <span>자료 요약 모음을 불러오지 못했습니다: {brief.error.message}</span>
        <button type="button" className="button-secondary" onClick={() => { void brief.refetch(); }}>다시 시도</button>
      </div>
    );
  } else {
    const data = brief.data;
    body = (
      <>
        <p className="feed-brief-intro">
          최근 만든 자료 요약 모음 #{data.briefId}입니다. 각 출처의 AI 요약을 따로 보여 주며, 서로 다른 자료를 하나의 결론으로 합치지 않습니다.
          생성 시점의 스냅샷이므로 원문이 바뀌었을 수 있습니다.
        </p>
        <ol className="feed-brief-list">
          {data.snapshot.map((entry, index) => {
            const result = parseAiResult(entry.analysis?.result_json);
            return (
              <li key={entry.documentId} className="feed-brief-entry">
                <div className="feed-brief-entry-head">
                  <span className="feed-brief-number" aria-label={`출처 ${index + 1}`}>[{index + 1}]</span>
                  <Tag tone={sourceTone[entry.sourceType] ?? 'gray'}>{sourceLabel[entry.sourceType] ?? '기타'}</Tag>
                </div>
                <Link className="feed-brief-entry-title" to={`/documents/${entry.documentId}?returnTo=${encodeURIComponent(detailSearch)}`}>{entry.title}</Link>
                <p className="feed-brief-summary">
                  <span className="feed-ai-mark">AI 요약</span>{' '}
                  {result ? result.summary : '요약 결과를 읽을 수 없습니다.'}
                </p>
                <span className="feed-brief-meta">
                  {result ? `핵심 주장 ${result.claims.length}개` : '주장 수 확인 불가'}
                  {' · '}{entry.analysis?.input_type === 'SNIPPET' ? '검색 요약 기반' : '본문 기반'}
                </span>
              </li>
            );
          })}
        </ol>
        {hiddenSyntheticCount > 0 && (
          <div className="feed-inline-note">
            <span>이 모음의 자료 {hiddenSyntheticCount}건은 테스트(합성) 자료라 ‘테스트 자료 포함’ 시 아래 목록에 보입니다.</span>
            <button type="button" className="button-secondary" onClick={onIncludeSynthetic}>테스트 자료 포함해서 보기</button>
          </div>
        )}
        {brief.isRefetchError && <p className="feed-inline-alert" role="alert">최신 상태로 다시 불러오지 못해 이전 결과를 표시합니다.</p>}
      </>
    );
  }

  return (
    <section className="feed-brief" aria-labelledby="feed-brief-title">
      {header}
      {body}
      {briefId !== null && !notFound && (
        <div className="feed-brief-links">
          <Link className="text-link" to={briefLink(briefId)}>요약 모음 전체 보기 →</Link>
          <Link className="text-link" to={briefLink()}>새 요약 모음 만들기 →</Link>
        </div>
      )}
    </section>
  );
}
