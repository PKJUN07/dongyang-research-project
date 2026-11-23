import { Link } from 'react-router-dom';
import { ExtractionReasonText } from './ExtractionReasonText';
import { safeLink, sourceLabel, extractionLabel } from '../../api/client';
import type { DocumentResult } from '../../api/client';
import { ReadingControls } from '../library/ReadingControls';
import { formatKstDateTime, relativeTime, sourceTone } from '../../lib/format';
export function DocumentCard({ document, runId, returnTo }: { document: DocumentResult; runId?: number; returnTo?: string }) {
  const detailParams = new URLSearchParams();
  if (runId) detailParams.set('runId', String(runId));
  if (returnTo) detailParams.set('returnTo', returnTo);
  return <article className="result-card">
    <div className="card-tags"><span className={`tag tag-${sourceTone[document.sourceType]}`} title={document.classificationReason}>{sourceLabel[document.sourceType]}</span>{document.synthetic && <span className="tag tag-purple">합성 데이터</span>}</div>
    <h3><Link to={`/documents/${document.documentId}?${detailParams}`}>{document.title}</Link></h3><p className="result-snippet">{document.snippet || '검색 요약이 제공되지 않았습니다.'}</p>
    <p className="result-domain">{document.domain} · 검색 수집: {document.retrievedAt ? `${formatKstDateTime(document.retrievedAt)} (${relativeTime(document.retrievedAt)})` : '미상'}</p>
    <details className="source-details"><summary>{extractionLabel[document.extractionStatus]} · 출처 정보</summary>
    {document.extractionReason && <p className="form-help"><ExtractionReasonText reason={document.extractionReason} /></p>}
    <p className="form-help">발행일: {document.publishedAt ?? '미상'} · {document.classificationReason}</p>
    <p className="form-help">AI 분석 전{document.duplicateCandidateCount > 0 && ` · 유사 자료 검토 후보 ${document.duplicateCandidateCount}건 (병합 아님)`}</p>
    </details>
    <ReadingControls documentId={document.documentId} />
    <footer className="result-card-footer"><Link to={`/documents/${document.documentId}?${detailParams}`}>자료 상세 보기 →</Link>{safeLink(document.url) && <a href={document.url} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>}</footer>
  </article>;
}
