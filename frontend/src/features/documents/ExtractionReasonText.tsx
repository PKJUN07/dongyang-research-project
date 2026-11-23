import { describeExtractionReason } from './extractionReason';
import './documents.css';

/** 본문 확보 사유를 한국어 문구로 보여 주고, 서버 코드는 접힌 details 안에만 둔다. */
export function ExtractionReasonText({ reason, className }: { reason: string | null | undefined; className?: string }) {
  const described = describeExtractionReason(reason);
  if (!described) return null;
  return <span className={['extraction-reason', className].filter(Boolean).join(' ')}>
    <span>{described.text}</span>
    {described.code && <details className="extraction-reason-code"><summary>원래 코드</summary><code>{described.code}</code></details>}
  </span>;
}
