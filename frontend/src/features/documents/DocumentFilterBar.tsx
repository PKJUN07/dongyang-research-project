import type { Topic } from '../../api/client';
import { useState } from 'react';
import { TitleSearch } from './TitleSearch';

export function DocumentFilterBar({ params, topics, onChange, onReset }: { params: URLSearchParams; topics: Topic[]; onChange: (name: string, value: string) => void; onReset: () => void }) {
  const advancedActive = Boolean(params.get('from') || params.get('to') || (params.get('readingStatus') && params.get('readingStatus') !== 'ALL') || params.get('favorite') === 'true' || params.get('readLater') === 'true');
  const [expanded, setExpanded] = useState(advancedActive);
  const [resetVersion, setResetVersion] = useState(0);
  return <fieldset className="document-filters"><legend className="visually-hidden">저장 자료 검색 조건</legend>
    <div className="filter-primary">
    <TitleSearch key={`${params.get('title') ?? ''}:${resetVersion}`} value={params.get('title') ?? ''} onSearch={value => onChange('title', value)} />
    <label>관심 주제<select value={params.get('topicId') ?? ''} onChange={e => onChange('topicId', e.target.value)}><option value="">전체 주제</option>{topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>출처 유형<select value={params.get('sourceType') ?? 'ALL'} onChange={e => onChange('sourceType', e.target.value)}><option value="ALL">전체 출처</option><option value="OFFICIAL">공식</option><option value="USER">사용자</option><option value="OTHER">기타</option></select></label>
    </div>
    <div className="filter-actions"><button className="button-secondary" aria-expanded={expanded} aria-controls="advanced-filters" onClick={() => setExpanded(!expanded)}>상세 필터·정렬 {expanded ? '접기' : '더 보기'}{advancedActive ? ' · 적용 중' : ''}</button><button className="button-quiet" onClick={() => { setResetVersion(v => v + 1); onReset(); }}>필터 초기화</button><label className="check-filter"><input type="checkbox" checked={params.get('includeSynthetic') === 'true'} onChange={e => onChange('includeSynthetic', e.target.checked ? 'true' : '')} />테스트 자료 포함</label></div>
    <div id="advanced-filters" className="filter-advanced" hidden={!expanded}>
    <label>기간 기준<select value={params.get('dateBasis') ?? 'PUBLISHED'} onChange={e => onChange('dateBasis', e.target.value)}><option value="PUBLISHED">발행일 (원문 표시 날짜)</option><option value="FETCHED">검색 수집일 (한국 시간)</option><option value="FIRST_SAVED">처음 저장일 (한국 시간)</option></select></label>
    <label>시작일<input type="date" value={params.get('from') ?? ''} onChange={e => onChange('from', e.target.value)} /></label>
    <label>종료일<input type="date" value={params.get('to') ?? ''} onChange={e => onChange('to', e.target.value)} /></label>
    <label className="check-filter"><input type="checkbox" checked={params.get('includeUnknown') === 'true'} onChange={e => onChange('includeUnknown', String(e.target.checked))} />기간 조건에서 날짜 미상 포함</label>
    <label>정렬<select value={params.get('sort') ?? 'FETCHED_DESC'} onChange={e => onChange('sort', e.target.value)}><option value="FETCHED_DESC">최근 검색 수집순</option><option value="PUBLISHED_DESC">발행일 최신순 · 미상은 뒤</option><option value="TITLE_ASC">제목순</option><option value="RANK">검색 순위순</option></select></label>
    <label>페이지 크기<select value={params.get('size') ?? '20'} onChange={e => onChange('size', e.target.value)}><option value="5">5개</option><option value="10">10개</option><option value="20">20개</option><option value="50">50개</option></select></label>
    <label>읽기 상태 필터<select value={params.get('readingStatus') ?? 'ALL'} onChange={e => onChange('readingStatus', e.target.value)}><option value="ALL">모든 읽기 상태</option><option value="UNREAD">읽지 않음</option><option value="READING">읽는 중</option><option value="READ">읽음</option></select></label>
    <label className="check-filter"><input type="checkbox" checked={params.get('favorite') === 'true'} onChange={e => onChange('favorite', e.target.checked ? 'true' : '')} />즐겨찾기만</label>
    <label className="check-filter"><input type="checkbox" checked={params.get('readLater') === 'true'} onChange={e => onChange('readLater', e.target.checked ? 'true' : '')} />나중에 읽기만</label>
    <p className="form-help">기간을 지정하면 날짜를 알 수 없는 자료는 제외됩니다. 포함하려면 위 항목을 선택하세요.</p>
    </div>
  </fieldset>;
}
