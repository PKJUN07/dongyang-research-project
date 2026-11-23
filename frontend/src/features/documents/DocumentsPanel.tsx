import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { request } from '../../api/client';
import type { ResultPage, Topic } from '../../api/client';
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState';
import { DocumentCard } from './DocumentCard';
import { DocumentFilterBar } from './DocumentFilterBar';
import { Pagination } from './Pagination';

const filterKeys = ['topicId', 'sourceType', 'title', 'dateBasis', 'from', 'to', 'sort', 'page', 'size', 'includeUnknown', 'readingStatus', 'favorite', 'readLater', 'includeSynthetic'];
export function DocumentsPanel({ runId: givenRunId, library = false }: { runId?: number; library?: boolean }) {
  const [params, setParams] = useSearchParams();
  const requestedRun = Number(params.get('runId'));
  const runId = givenRunId ?? (Number.isSafeInteger(requestedRun) && requestedRun > 0 && !library ? requestedRun : undefined);
  const location = useLocation();
  const filters = new URLSearchParams();
  filterKeys.forEach(key => { if (params.has(key)) filters.set(key, params.get(key)!); });
  if (!filters.has('sort')) filters.set('sort', 'FETCHED_DESC');
  if (library) filters.set('saved', 'true');
  filters.delete('includeSynthetic');
  if (!runId && params.get('includeSynthetic') !== 'true') filters.set('synthetic', 'false');
  const filterString = filters.toString();
  const data = useQuery({
    queryKey: ['saved-documents', runId ?? 'all', filterString],
    queryFn: ({ signal }) => request<ResultPage>(`${runId ? `/search-sessions/${runId}/results` : '/documents'}?${filterString}`, undefined, signal), retry: false,
  });
  const topics = useQuery({ queryKey: ['topics'], queryFn: ({ signal }) => request<Topic[]>('/topics', undefined, signal) });
  function change(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    if (name !== 'page') next.set('page', '0');
    setParams(next, { replace: name !== 'page' });
  }
  return <section aria-label="저장 자료 목록" className="saved-documents">
    <DocumentFilterBar params={params} topics={topics.data ?? []} onChange={change} onReset={() => { const next = new URLSearchParams(params); filterKeys.forEach(key => next.delete(key)); setParams(next, { replace: true }); }} />
    {topics.isError && <p role="alert">주제 필터 목록을 불러오지 못했습니다. 다른 필터는 사용할 수 있습니다.</p>}
    {data.isPending && <LoadingState title="조건에 맞는 저장 자료 조회 중" />}
    {data.isError && <ErrorState title="자료 필터 조회 실패" description={data.error.message} onRetry={() => { void data.refetch(); }} />}
    {!runId && <p className="form-help">{params.get('includeSynthetic') === 'true' ? '실제 수집 자료와 합성 테스트 자료를 함께 표시합니다.' : '실제 수집 자료만 표시합니다. 테스트 자료는 위 항목에서 포함할 수 있습니다.'}</p>}
    {data.data && <><div className="results-toolbar"><h2>{library ? '내 보관함' : runId ? '이 검색의 자료' : '전체 수집 자료'} <span>{data.data.totalElements}건</span></h2><p role="status">{data.isFetching ? '목록 갱신 중…' : `${data.data.items.length}건 표시`}</p></div>
      {data.data.items.length ? <div className="result-list">{data.data.items.map(item => <DocumentCard key={item.documentId} document={item} runId={runId} returnTo={location.pathname + location.search} />)}</div> : <><EmptyState title={data.data.totalElements ? '현재 페이지에 자료가 없습니다' : library && !params.toString() ? '아직 보관한 자료가 없습니다' : '조건에 맞는 자료가 없습니다'} description={library ? '전체 수집 자료에서 ‘내 보관함에 담기’를 누르세요. 조건이 적용되어 있다면 필터를 초기화해 보세요.' : '제목·주제·출처 조건을 바꾸거나 필터를 초기화해 보세요.'} />{library && <Link className="text-link" to="/documents">수집 자료 둘러보기 →</Link>}</>}
      {data.data.page >= data.data.totalPages && data.data.page > 0 && <button onClick={() => change('page', '0')}>첫 페이지로 이동</button>}
      {data.data.totalPages > 0 && <Pagination page={data.data.page} totalPages={data.data.totalPages} pending={data.isFetching} onChange={p => change('page', String(p))} />}
    </>}
  </section>;
}
