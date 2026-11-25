import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, extractionLabel, request, safeLink, sourceLabel } from '../../api/client';
import type { DocumentResult } from '../../api/client';
import { useTopics } from '../../api/queries';
import { EmptyState, ErrorState } from '../../components/AsyncState';
import { PageHeader } from '../../components/PageHeader';
import { Card, Notice, Skeleton, Tag } from '../../components/ui';
import { formatKstDateTime, readingMinutes, sourceTone, topicColor } from '../../lib/format';
import { rememberLastDocument } from '../../lib/storage';
import { DocumentActions } from '../library/DocumentActions';
import { NoteEditor } from '../library/NoteEditor';
import { useDocumentTopicIds } from '../library/useReading';
import { AiPanel } from './AiPanel';
import { ContentTabs } from './ContentTabs';
import { ExtractionReasonText } from './ExtractionReasonText';
import './detail.css';

/** 목록 복귀 경로로 허용하는 앱 내부 화면. 외부 주소나 다른 경로는 기본 목록으로 대체한다. */
const returnPattern = /^\/(search|documents|library|brief|feed|stats)(\?|$)/;

function publishedText(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

export default function DocumentDetailPage() {
  const { documentId } = useParams();
  const [params] = useSearchParams();
  const runId = params.get('runId');
  const from = params.get('returnTo');
  // returnTo가 없으면: 검색 세션에서 왔으면(runId) 그 검색 결과로, 아니면 전체 수집 자료로 돌아간다.
  const backTo = from && returnPattern.test(from) ? from : runId ? `/search?runId=${encodeURIComponent(runId)}` : '/documents';
  const doc = useQuery({ queryKey: ['document', documentId, runId], queryFn: ({ signal }) => request<DocumentResult>(`/documents/${documentId}${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`, undefined, signal), retry: false });
  const loadedId = doc.data?.documentId;
  useEffect(() => { if (loadedId) rememberLastDocument(loadedId); }, [loadedId]);
  const header = <PageHeader title="자료 상세" description="원문 제공 정보와 AI가 생성한 분석을 분리해 검토합니다." actions={<Link className="button-link-secondary" to={backTo}>← 목록으로</Link>} />;
  if (doc.isPending) return <section className="page-shell det-page">{header}<div className="card det-loading"><p role="status">자료를 불러오는 중…</p><Skeleton lines={5} /></div></section>;
  if (!doc.data) {
    const missing = doc.error instanceof ApiError && doc.error.status === 404;
    return <section className="page-shell det-page">{header}
      {missing
        ? <div role="alert"><EmptyState title="자료를 찾을 수 없습니다" description="삭제되었거나 주소가 잘못되었을 수 있습니다. 목록에서 다시 선택해 주세요." /></div>
        : <ErrorState title="자료 조회 실패" description={doc.error?.message} onRetry={() => { void doc.refetch(); }} />}
      <p className="det-back"><Link className="text-link" to={backTo}>← 목록으로 돌아가기</Link></p>
    </section>;
  }
  return <section className="page-shell det-page">{header}
    {doc.isError && <div className="det-refresh-alert" role="alert">자료 정보를 새로 불러오지 못했습니다. 마지막으로 불러온 내용을 표시합니다. <button className="button-secondary" onClick={() => { void doc.refetch(); }}>다시 시도</button></div>}
    <DetailBody item={doc.data} backTo={backTo} />
  </section>;
}

function DetailBody({ item, backTo }: { item: DocumentResult; backTo: string }) {
  const topics = useTopics();
  const links = useDocumentTopicIds(item.documentId);
  const linkedTopics = (links.data ?? []).map(id => topics.data?.find(t => t.id === id)).filter(t => t !== undefined);
  const published = publishedText(item.publishedAt);
  const id = item.documentId;
  return <div className="layout-main-aside det-layout">
    <article className="card det-main" aria-labelledby={`doc-title-${id}`}>
      <nav className="det-jump" aria-label="이 화면 바로가기"><a href={`#ai-summary-${id}`}>AI 요약 ↓</a><a href={`#note-${id}`}>메모 ↓</a><a href={`#actions-${id}`}>할 일 ↓</a></nav>
      <div className="card-tags det-tags">
        <Tag tone={sourceTone[item.sourceType]}>{sourceLabel[item.sourceType]}</Tag>
        {linkedTopics.map(t => <span key={t.id} className="tag det-topic-tag"><span className="topic-dot" style={{ background: topicColor(t.id) }} aria-hidden="true" />{t.name}</span>)}
        {item.contentText && <Tag>읽는 데 약 {readingMinutes(item.contentText)}분</Tag>}
      </div>
      <h2 className="det-title" id={`doc-title-${id}`}>{item.title}</h2>
      <p className="det-meta">
        <span>{published ? `발행 ${published}` : '발행일 미상'}</span>
        <span>검색 수집 {formatKstDateTime(item.retrievedAt)}</span>
        <span>{item.domain}</span>
        {safeLink(item.url) && <a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>}
      </p>
      <ContentTabs key={id} item={item} />
      <AiPanel id={id} bodyAvailable={Boolean(item.contentText)} />
      <NoteEditor key={id} documentId={id} />
    </article>
    <aside className="stack det-aside" aria-label="자료 조작과 출처 정보" id={`actions-${id}`}>
      <DocumentActions documentId={id} url={item.url} />
      <Card title="출처 정보" className="det-source">
        <dl className="det-source-list">
          <div><dt>출처 근거</dt><dd><Tag tone={sourceTone[item.sourceType]}>{sourceLabel[item.sourceType]}</Tag> {item.classificationReason || '분류 근거가 기록되지 않았습니다.'}</dd></div>
          <div><dt>발행일</dt><dd>{published ?? '미상'}</dd></div>
          <div><dt>원문 주소</dt><dd>{safeLink(item.url) ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a> : '안전하지 않은 주소'}</dd></div>
          <div><dt>본문 확보 상태</dt><dd>{extractionLabel[item.extractionStatus]}{item.contentText ? ` · ${item.contentText.length.toLocaleString()}자` : ''}{item.extractionReason && <ExtractionReasonText className="det-source-reason" reason={item.extractionReason} />}</dd></div>
          {item.duplicateCandidateCount > 0 && <div><dt>유사 자료</dt><dd>검토 후보 {item.duplicateCandidateCount}건 (병합 아님)</dd></div>}
        </dl>
      </Card>
      <Notice title="출처 원문 보존">AI 분석을 다시 생성해도 실제 제목·출처·검색 요약·원문 URL은 변경되지 않습니다.</Notice>
      <Link className="text-link det-back-aside" to={backTo}>← 목록으로 돌아가기</Link>
    </aside>
  </div>;
}
