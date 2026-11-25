/** 자료 목록(/documents, /library, 검색 결과)이 함께 쓰는 URL 조건 → API 조건 변환과 변경 함수. */
import { useSearchParams } from 'react-router-dom';

/** URL에 남기는 목록 조건 이름. 초기화 시 이 이름들만 지운다. */
export const filterKeys = ['topicId', 'sourceType', 'title', 'dateBasis', 'from', 'to', 'sort', 'page', 'size', 'includeUnknown', 'readingStatus', 'favorite', 'readLater'];

/** 정렬·페이지·크기를 뺀 실제 조건이 하나라도 있는지(빈 결과 안내 문구 선택용). */
export function hasListConditions(params: URLSearchParams) {
  return filterKeys.some(key => !['sort', 'page', 'size'].includes(key) && Boolean(params.get(key)));
}

/**
 * URL 조건을 /documents(또는 검색 세션 결과) API 조건으로 바꾼다.
 * 보관함은 saved=true를 고정해 URL로 우회하지 못하게 한다.
 */
export function buildListFilters(params: URLSearchParams, { library = false }: { library?: boolean; runId?: number } = {}) {
  const filters = new URLSearchParams();
  filterKeys.forEach(key => { if (params.has(key)) filters.set(key, params.get(key)!); });
  if (!filters.has('sort')) filters.set('sort', 'FETCHED_DESC');
  if (library) filters.set('saved', 'true');
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

