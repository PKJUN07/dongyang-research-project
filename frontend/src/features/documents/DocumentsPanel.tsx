import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { request } from '../../api/client';
import type { ResultPage } from '../../api/client';
import { useTopics } from '../../api/queries';
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState';
import { LibraryBoard } from '../library/LibraryBoard';
import { DocumentCard } from './DocumentCard';
import { DocumentFilterBar } from './DocumentFilterBar';
import { Pagination } from './Pagination';
import { buildListFilters, hasListConditions, useHiddenSyntheticCount, useListParams } from './documentFilters';
import { SyntheticHiddenNotice } from './SyntheticHiddenNotice';
import './documents.css';

/**
 * 자료 목록. runId가 있으면 그 검색의 결과, library면 읽기 보관함(주제 카드·상태 칩 포함), 아니면 전체 수집 자료.
 * 검색 화면이 runId로 사용하므로 props 형태를 유지한다.
 */
export function DocumentsPanel({ runId, library = false }: { runId?: number; library?: boolean }) {
  return library ? <LibraryBoard manageOpen /> : <CollectedDocuments givenRunId={runId} />;
}

function CollectedDocuments({ givenRunId }: { givenRunId?: number }) {
  const { params, change, reset } = useListParams();
  const requestedRun = Number(params.get('runId'));
  const runId = givenRunId ?? (Number.isSafeInteger(requestedRun) && requestedRun > 0 ? requestedRun : undefined);
  const location = useLocation();
  const filterString = buildListFilters(params, { runId }).toString();
  const data = useQuery({
    queryKey: ['saved-documents', runId ?? 'all', filterString],
    queryFn: ({ signal }) => request<ResultPage>(`${runId ? `/search-sessions/${runId}/results` : '/documents'}?${filterString}`, undefined, signal), retry: false,
  });
  const topics = useTopics();
  const includeSynthetic = params.get('includeSynthetic') === 'true';
  const hiddenSynthetic = useHiddenSyntheticCount(params, { runId });
  const onlySyntheticHidden = Boolean(data.data && data.data.totalElements === 0 && hiddenSynthetic > 0);
  return <section aria-label="저장 자료 목록" className="saved-documents">
    <DocumentFilterBar params={params} topics={topics.data ?? []} onChange={change} onReset={reset} />
    {topics.isError && <p className="docs-inline-alert" role="alert">주제 필터 목록을 불러오지 못했습니다. 다른 필터는 사용할 수 있습니다.</p>}
    {data.isPending && <LoadingState title="조건에 맞는 저장 자료 조회 중" />}
    {data.isError && !data.data && <ErrorState title="자료 필터 조회 실패" description={data.error.message} onRetry={() => { void data.refetch(); }} />}
    {data.isError && data.data && <p className="docs-inline-alert" role="alert">목록을 새로 불러오지 못했습니다. 마지막으로 불러온 목록을 표시합니다. <button className="button-secondary" onClick={() => { void data.refetch(); }}>다시 시도</button></p>}
    {!runId && (hiddenSynthetic > 0 || includeSynthetic) && !onlySyntheticHidden ? <SyntheticHiddenNotice hidden={hiddenSynthetic} included={includeSynthetic} onToggle={include => change('includeSynthetic', include ? 'true' : '')} />
      : !runId && <p className="form-help">실제 수집 자료만 표시합니다. 테스트 자료는 위 항목에서 포함할 수 있습니다.</p>}
    {data.data && <><div className="results-toolbar"><h2>{runId ? '이 검색의 자료' : '전체 수집 자료'} <span>{data.data.totalElements}건</span></h2><p role="status">{data.isFetching ? '목록 갱신 중…' : `${data.data.items.length}건 표시`}</p></div>
      {onlySyntheticHidden ? <div className="docs-synthetic-empty"><EmptyState title={`테스트(합성) 자료 ${hiddenSynthetic.toLocaleString()}건이 숨겨져 있습니다`} description="기본 설정은 실제 수집 자료만 보여 줍니다. 테스트 검색으로 모은 자료를 보려면 함께 표시하세요." /><p className="docs-empty-links"><button onClick={() => change('includeSynthetic', 'true')}>테스트 자료 포함해서 보기</button></p></div>
      : data.data.items.length ? <div className="result-list">{data.data.items.map(item => <DocumentCard key={item.documentId} document={item} runId={runId} returnTo={location.pathname + location.search} />)}</div> : <EmptyState title={data.data.totalElements ? '현재 페이지에 자료가 없습니다' : hasListConditions(params) ? '조건에 맞는 자료가 없습니다' : '아직 수집한 자료가 없습니다'} description={hasListConditions(params) ? '제목·주제·출처 조건을 바꾸거나 필터를 초기화해 보세요.' : '검색 화면에서 새 자료를 검색하면 여기에 모입니다.'} />}
      {!data.data.items.length && !runId && !onlySyntheticHidden && <p className="docs-empty-links"><Link className="text-link" to="/search">새 자료 검색하기 →</Link></p>}
      {data.data.page >= data.data.totalPages && data.data.page > 0 && <button onClick={() => change('page', '0')}>첫 페이지로 이동</button>}
      {data.data.totalPages > 0 && <Pagination page={data.data.page} totalPages={data.data.totalPages} pending={data.isFetching} onChange={p => change('page', String(p))} />}
    </>}
  </section>;
}
