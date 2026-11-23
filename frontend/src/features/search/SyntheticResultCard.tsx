import { Link } from "react-router-dom";
import type { SyntheticSearchResult } from "../../data/syntheticSearchResults";

type SyntheticResultCardProps = {
  result: SyntheticSearchResult;
};

export function SyntheticResultCard({ result }: SyntheticResultCardProps) {
  return (
    <article className="result-card">
      <div className="card-tags">
        <span className={'tag tag-' + result.sourceType}>{result.sourceLabel}</span>
        <span className="tag tag-synthetic">합성 데이터</span>
      </div>
      <h3>{result.title}</h3>
      <p>{result.snippet}</p>
      <div className="result-card-footer">
        <span className="result-domain">{result.domain}</span>
        <Link to={'/documents/' + result.id}>상세 자리 확인 →</Link>
      </div>
    </article>
  );
}
