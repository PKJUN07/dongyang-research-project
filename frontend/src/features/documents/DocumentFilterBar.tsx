import type { Topic } from '../../api/client';
import { useState } from 'react';
import { TitleSearch } from './TitleSearch';

export function DocumentFilterBar({ params, topics, onChange, onReset }: { params: URLSearchParams; topics: Topic[]; onChange: (name: string, value: string) => void; onReset: () => void }) {
  const [resetVersion, setResetVersion] = useState(0);
  return <fieldset className="document-filters"><legend className="visually-hidden">저장 자료 검색 조건</legend>
    <div className="filter-primary">
    <TitleSearch key={`${params.get('title') ?? ''}:${resetVersion}`} value={params.get('title') ?? ''} onSearch={value => onChange('title', value)} />
    <label>관심 주제<select value={params.get('topicId') ?? ''} onChange={e => onChange('topicId', e.target.value)}><option value="">전체 주제</option>{topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>출처 유형<select value={params.get('sourceType') ?? 'ALL'} onChange={e => onChange('sourceType', e.target.value)}><option value="ALL">전체 출처</option><option value="OFFICIAL">공식</option><option value="USER">사용자</option><option value="OTHER">기타</option></select></label>
    </div>
    <div className="filter-actions"><button className="button-quiet" onClick={() => { setResetVersion(v => v + 1); onReset(); }}>필터 초기화</button></div>
  </fieldset>;
}
