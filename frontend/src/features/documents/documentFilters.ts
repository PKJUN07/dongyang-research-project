/** 자료 목록(/documents, /library, 검색 결과)이 함께 쓰는 URL 조건 → API 조건 변환과 변경 함수. */
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { request } from '../../api/client';
import type { ResultPage } from '../../api/client';

/** URL에 남기는 목록 조건 이름. 초기화 시 이 이름들만 지운다. */
export const filterKeys = ['topicId', 'sourceType', 'title', 'dateBasis', 'from', 'to', 'sort', 'page', 'size', 'includeUnknown', 'readingStatus', 'favorite', 'readLater', 'includeSynthetic'];

/** 정렬·페이지·크기를 뺀 실제 조건이 하나라도 있는지(빈 결과 안내 문구 선택용). */
export function hasListConditions(params: URLSearchParams) {
  return filterKeys.some(key => !['sort', 'page', 'size'].includes(key) && Boolean(params.get(key)));
}

/**
 * URL 조건을 /documents(또는 검색 세션 결과) API 조건으로 바꾼다.
 * 보관함은 saved=true를 고정해 URL로 우회하지 못하게 하고, 검색 세션이 아니면 합성 자료를 기본 제외한다.
 */
export function buildListFilters(params: URLSearchParams, { library = false, runId }: { library?: boolean; runId?: number } = {}) {
  const filters = new URLSearchParams();
  filterKeys.forEach(key => { if (params.has(key)) filters.set(key, params.get(key)!); });
  if (!filters.has('sort')) filters.set('sort', 'FETCHED_DESC');
  if (library) filters.set('saved', 'true');
  filters.delete('includeSynthetic');
  if (!runId && params.get('includeSynthetic') !== 'true') filters.set('synthetic', 'false');
  return filters;
}

/** 목록 조건 변경 도우미. 페이지 이외의 조건이 바뀌면 첫 페이지로 돌아간다. */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  function changeMany(updates: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([name, value]) => { if (value) next.set(name, value); else next.delete(name); });
    const pageOnly = Object.keys(updates).every(name => name === 'page');
    if (!pageOnly) next.set('page', '0');
    setParams(next, { replace: !pageOnly });
  }
  function change(name: string, value: string) { changeMany({ [name]: value }); }
  function reset() {
    const next = new URLSearchParams(params);
    filterKeys.forEach(key => next.delete(key));
    setParams(next, { replace: true });
  }
  return { params, change, changeMany, reset };
}

/**
 * 합성(테스트) 자료를 숨긴 상태에서, 같은 조건이라면 보였을 합성 자료 수(실제 API totalElements).
 * 합성 포함 상태이거나 검색 세션 결과면 조회하지 않고 0을 돌려준다.
 * 키 접두사 ['saved-documents']라 보관·주제 변경 시 함께 갱신된다.
 */
export function useHiddenSyntheticCount(params: URLSearchParams, options: { library?: boolean; runId?: number } = {}) {
  const active = !options.runId && params.get('includeSynthetic') !== 'true';
  const filters = buildListFilters(params, options);
  filters.set('synthetic', 'true');
  ['sort', 'page', 'size'].forEach(key => filters.delete(key));
  filters.sort();
  const search = filters.toString();
  const query = useQuery({
    queryKey: ['saved-documents', 'hidden-synthetic', search],
    queryFn: async ({ signal }) => (await request<ResultPage>(`/documents?${search}&size=1`, undefined, signal)).totalElements,
    enabled: active,
    retry: false,
  });
  return active ? query.data ?? 0 : 0;
}
