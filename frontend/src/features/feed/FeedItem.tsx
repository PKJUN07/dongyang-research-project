import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { request, safeLink, sourceLabel } from '../../api/client';
import type { DocumentResult, ReadingState, Topic } from '../../api/client';
import type { Readiness } from '../../api/queries';
import { IconToggle, Tag } from '../../components/ui';
import { relativeTime, sourceTone } from '../../lib/format';
import { isNewDocument, readinessLabel, useDocumentTopicIds } from './feedUtils';
import type { AnalysisCounts } from './feedUtils';

export type ItemAnalysis =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'state'; state: Readiness }
  | { kind: 'detail-loading' }
  | { kind: 'detail-error' }
  | { kind: 'counts'; counts: AnalysisCounts };

type Patch = { readLater: boolean } | { favorite: boolean };

function patchMessage(patch: Patch) {
  if ('readLater' in patch) return patch.readLater ? '나중에 읽기에 담았습니다.' : '나중에 읽기에서 뺐습니다.';
  return patch.favorite ? '즐겨찾기에 추가했습니다.' : '즐겨찾기를 해제했습니다.';
}

/** 피드 항목 한 개. 나중에 읽기·즐겨찾기는 서버 PATCH 성공 후에만 상태가 바뀐다. */
export function FeedItem({ document, topics, selectedTopicId, briefNumber, analysis, detailSearch }: {
  document: DocumentResult; topics: Topic[] | undefined; selectedTopicId: string; briefNumber?: number; analysis: ItemAnalysis; detailSearch: string;
}) {
  const cache = useQueryClient();
  const id = document.documentId;
  const topicIds = useDocumentTopicIds(id);
  const linkedTopics = (topicIds.data ?? [])
    .map(topicId => topics?.find(topic => topic.id === topicId))
    .filter((topic): topic is Topic => Boolean(topic))
    .sort((a, b) => Number(String(b.id) === selectedTopicId) - Number(String(a.id) === selectedTopicId));
  const update = useMutation({
    mutationFn: (patch: Patch) => request<ReadingState>(`/documents/${id}/reading`, patch, undefined, 'PATCH'),
    onSuccess: async data => {
      cache.setQueryData(['reading', id], data);
      await Promise.all(['saved-documents', 'document', 'stats'].map(key => cache.invalidateQueries({ queryKey: [key] })));
    },
    retry: false,
  });
  const detailLink = `/documents/${id}?returnTo=${encodeURIComponent(detailSearch)}`;
  const titleId = `feed-item-${id}`;

  return (
    <article className="feed-item" aria-labelledby={titleId}>
      <div className="feed-item-top">
        <div className="card-tags">
          <Tag tone={sourceTone[document.sourceType]}>{sourceLabel[document.sourceType]}</Tag>
          {linkedTopics.slice(0, 2).map(topic => <Tag key={topic.id}>{topic.name}</Tag>)}
          {linkedTopics.length > 2 && <Tag>외 {linkedTopics.length - 2}</Tag>}
          {isNewDocument(document.retrievedAt) && <Tag tone="purple">새 자료</Tag>}
          {briefNumber !== undefined && <Tag tone="blue">브리프 [{briefNumber}]</Tag>}
        </div>
        <div className="feed-item-toggles">
          <IconToggle icon="◔" label="나중에 읽기" pressed={document.readLater}
            disabled={update.isPending} onClick={() => update.mutate({ readLater: !document.readLater })} />
          <IconToggle icon={document.favorite ? '★' : '☆'} label="즐겨찾기" pressed={document.favorite}
            disabled={update.isPending} onClick={() => update.mutate({ favorite: !document.favorite })} />
        </div>
      </div>
      <h3 className="feed-item-title" id={titleId}><Link to={detailLink}>{document.title}</Link></h3>
      <p className="feed-item-snippet">{document.snippet || '검색 요약이 제공되지 않았습니다.'}</p>
      <p className="feed-item-meta">
        <span>{document.domain} · {relativeTime(document.retrievedAt)} 수집</span>
        {safeLink(document.url) && <a className="feed-item-origin" href={document.url} target="_blank" rel="noopener noreferrer">원문 ↗</a>}
        {(document.readLater || document.favorite) && (
          <span className="feed-item-flags">{[document.readLater && '나중에 읽기', document.favorite && '즐겨찾기'].filter(Boolean).join(' · ')}</span>
        )}
      </p>
      <p className="feed-item-feedback" role="status">
        {update.isPending ? '변경 저장 중…' : update.isSuccess ? patchMessage(update.variables) : ''}
      </p>
      {update.isError && (
        <div className="feed-inline-alert" role="alert">
          <span>변경하지 못했습니다: {update.error.message}</span>
          <button type="button" className="button-secondary" onClick={() => update.mutate(update.variables)}>다시 시도</button>
        </div>
      )}
      <AnalysisLine analysis={analysis} detailLink={detailLink} />
    </article>
  );
}

function AnalysisLine({ analysis, detailLink }: { analysis: ItemAnalysis; detailLink: string }) {
  let text: string;
  let showLink = true;
  switch (analysis.kind) {
    case 'loading': text = '분석 상태 확인 중'; showLink = false; break;
    case 'error': text = '분석 상태를 불러오지 못했습니다'; break;
    case 'detail-loading': text = '분석 완료 · 결과 불러오는 중'; showLink = false; break;
    case 'detail-error': text = '분석 완료 · 결과를 불러오지 못했습니다'; break;
    case 'counts':
      text = `핵심 주장 ${analysis.counts.claims} · 근거 ${analysis.counts.evidence} · 한계 ${analysis.counts.limitations}`;
      showLink = false; break;
    default: text = readinessLabel[analysis.state];
  }
  return (
    <div className={`feed-ai-line${analysis.kind === 'counts' ? ' feed-ai-line-ready' : ''}`}>
      <span className="feed-ai-mark">AI 분석</span>
      <span>{text}</span>
      {analysis.kind === 'counts' && <Link className="feed-ai-link" to={detailLink}>결과 보기</Link>}
      {showLink && <Link className="feed-ai-link" to={detailLink}>상세에서 분석</Link>}
    </div>
  );
}
