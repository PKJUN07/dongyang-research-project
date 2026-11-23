import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { request, safeLink, sourceLabel } from '../../api/client';
import { ContentTabs } from './ContentTabs';
import { AiPanel } from './AiPanel';
import type { DocumentResult } from '../../api/client';
import { ErrorState, LoadingState } from '../../components/AsyncState';
import { PageHeader } from '../../components/PageHeader';
import { ReadingControls } from '../library/ReadingControls';
import { NoteEditor } from '../library/NoteEditor';
import { DocumentTopics } from '../library/DocumentTopics';
export default function DocumentDetailPage() {
  const { documentId } = useParams();
  const [params] = useSearchParams();
  const runId = params.get('runId');
  const from = params.get('returnTo');
  const backTo = from && /^\/(search|documents|library|brief)(\?|$)/.test(from) ? from : `/search${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`;
  const document = useQuery({ queryKey: ['document', documentId, runId], queryFn: ({ signal }) => request<DocumentResult>(`/documents/${documentId}${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`, undefined, signal), retry: false });
  if (document.isPending) return <LoadingState title="자료를 불러오는 중" />;
  if (document.isError) return <section className="page-shell"><ErrorState title="자료 조회 실패" description={document.error.message} onRetry={() => { void document.refetch(); }} /><Link to={backTo}>← 목록으로</Link></section>;
  const item = document.data;
  return <section className="page-shell">
    <div className="detail-navigation"><Link className="text-link" to={backTo}>← 목록으로</Link><a className="text-link" href={`#ai-summary-${item.documentId}`}>AI 요약 확인 ↓</a><a className="text-link" href={`#note-${item.documentId}`}>메모 작성으로 이동 ↓</a></div>
    <PageHeader eyebrow="DOCUMENT DETAIL" title="자료 상세" description="검색 요약과 원문 정보를 구분해 확인합니다." />
    <article className="detail-card">
      <div className="card-tags"><span className="tag">{sourceLabel[item.sourceType]}</span>{item.synthetic && <span className="tag tag-synthetic">합성 데이터</span>}</div>
      <h2>{item.title}</h2><p>{item.domain} · 검색 수집일: {new Date(item.retrievedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
      {safeLink(item.url) && <p><a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a></p>}
      <ReadingControls documentId={item.documentId} />
      <p><Link to={item.synthetic ? '/library?includeSynthetic=true' : '/library'}>내 보관함 열기 →</Link></p>
      <ContentTabs key={item.documentId} item={item} />
      <AiPanel id={item.documentId} bodyAvailable={Boolean(item.contentText)} />
      <dl className="detail-grid"><div><dt>발행일</dt><dd>{item.publishedAt ?? '미상'}</dd></div><div><dt>출처 근거</dt><dd>{item.classificationReason}</dd></div><div><dt>원문 주소</dt><dd>{safeLink(item.url) ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a> : '안전하지 않은 주소'}</dd></div></dl>
      <div className="personal-workspace"><NoteEditor key={item.documentId} documentId={item.documentId} /><div><DocumentTopics documentId={item.documentId} /><p className="form-help">내 메모는 직접 작성한 기록입니다. AI 요약과 원문을 비교해 확인하세요.</p></div></div>
      <Link className="text-link" to={backTo}>← 목록으로 돌아가기</Link>
    </article>
  </section>;
}
