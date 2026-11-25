import { Link } from 'react-router-dom';
import { ApiError, sourceLabel } from '../../api/client';
import { Skeleton, Tag } from '../../components/ui';
import { formatKstDateTime, sourceTone } from '../../lib/format';
import type { LastBrief } from './feedUtils';

/** 'AI 주제 브리프' = 최근 만든 자료 요약 모음 스냅샷. 출처별 요약을 따로 보여 주고 하나의 결론으로 합치지 않는다. */
export function FeedBriefCard({ lastBrief, detailSearch }: { lastBrief: LastBrief; detailSearch: string }) {
  const { briefId, query: brief } = lastBrief;
  const briefLink = (id?: number) => id ? `/brief?briefId=${id}` : '/brief';
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
        <p>AI 분석을 마친 자료를 2~5개 고르면 공통점·차이·원문 확인이 필요한 부분을 나눠 정리합니다. 모든 문장은 근거 자료 번호와 연결됩니다.</p>
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
    const synthesis = data.synthesis ?? undefined;
    const status = data.synthesisStatus ?? 'NONE';
    const snippetCount = data.snapshot.filter(entry => entry.analysis?.input_type === 'SNIPPET').length;
    body = (
      <>
        {data.question && <p className="feed-brief-question"><span className="feed-ai-mark">질문</span> {data.question}</p>}
        {synthesis ? (
          <>
            <p className="feed-brief-overview">{synthesis.answer?.text ?? synthesis.overview}</p>
            <ul className="feed-brief-stats" aria-label="교차 정리 항목 수">
              <li><strong>{synthesis.common.length}</strong>공통점</li>
              <li><strong>{synthesis.differences.length}</strong>차이·고유</li>
              <li><strong>{synthesis.checks.length}</strong>원문 확인 필요</li>
            </ul>
            {synthesis.common[0] && <p className="feed-brief-highlight"><span className="feed-brief-hl-label">공통</span>{synthesis.common[0].text}</p>}
            {synthesis.differences[0] && <p className="feed-brief-highlight"><span className="feed-brief-hl-label">차이</span>{synthesis.differences[0].topic ? `${synthesis.differences[0].topic} · ` : ''}{synthesis.differences[0].text}</p>}
          </>
        ) : (
          <p className="feed-brief-intro" role={status === 'FAILED' ? 'alert' : 'status'}>
            {status === 'QUEUED' || status === 'RUNNING' ? '로컬 AI가 자료끼리 공통점과 차이를 비교하고 있습니다.'
              : status === 'FAILED' ? '교차 정리를 만들지 못했습니다. 전체 보기에서 다시 요청할 수 있습니다.'
              : '자료별 요약만 있는 모음입니다. 전체 보기에서 교차 정리를 만들 수 있습니다.'}
          </p>
        )}
        <ol className="feed-brief-sources" aria-label="모음에 포함된 자료">
          {data.snapshot.map((entry, index) => (
            <li key={entry.documentId}>
              <span className="bv-chip" aria-hidden="true">{index + 1}</span>
              <Link to={`/documents/${entry.documentId}?returnTo=${encodeURIComponent(detailSearch)}`}>{entry.title}</Link>
              <Tag tone={sourceTone[entry.sourceType] ?? 'gray'}>{sourceLabel[entry.sourceType] ?? '기타'}</Tag>
            </li>
          ))}
        </ol>
        {snippetCount > 0 && <span className="feed-brief-meta">검색 발췌 기반 자료 {snippetCount}건 포함 · 본문을 확보해 다시 분석하면 정리가 더 정확해집니다.</span>}
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
