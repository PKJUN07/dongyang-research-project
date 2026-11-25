import { useState } from 'react';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { request } from '../../api/client';
import type { ResultPage } from '../../api/client';
import type { AiJobs, Readiness } from '../../api/queries';
import { useDocumentCount, useTopics } from '../../api/queries';
import { ErrorState } from '../../components/AsyncState';
import { PageHeader } from '../../components/PageHeader';
import { ChipTabs, Skeleton } from '../../components/ui';
import { Pagination } from '../documents/Pagination';
import { FeedBriefCard } from './FeedBriefCard';
import { FeedItem } from './FeedItem';
import type { ItemAnalysis } from './FeedItem';
import { FeedSummaryAside } from './FeedSummaryAside';
import { PAGE_SIZE, analysisCounts, baseFilter, sortOptions, tabFilter, tabLabels, tabValues, useLastBrief } from './feedUtils';
import type { FeedSort, FeedTab } from './feedUtils';
import './feed.css';

/** 리서치 피드: 실제 수집 자료 목록과 AI가 만든 자료 요약 모음을 분리해 보여 준다. */
export default function FeedPage() {
  const [params, setParams] = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(false);

  const topicId = /^\d+$/.test(params.get('topicId') ?? '') ? params.get('topicId')! : '';
  const sort = (sortOptions.some(option => option.value === params.get('sort')) ? params.get('sort') : 'FETCHED_DESC') as FeedSort;
  const tab = (tabValues.includes(params.get('tab') as FeedTab) ? params.get('tab') : 'ALL') as FeedTab;
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 0;
  const detailSearch = params.toString() ? `/feed?${params}` : '/feed';

  function change(updates: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    if (!('page' in updates)) next.delete('page');
    setParams(next);
  }

  const topics = useTopics();
  const topicName = topics.data?.find(topic => String(topic.id) === topicId)?.name;
  const base = baseFilter(topicId);
  const counts: Record<FeedTab, ReturnType<typeof useDocumentCount>> = {
    ALL: useDocumentCount(base),
    OFFICIAL: useDocumentCount({ ...base, ...tabFilter('OFFICIAL') }),
    USER: useDocumentCount({ ...base, ...tabFilter('USER') }),
    OTHER: useDocumentCount({ ...base, ...tabFilter('OTHER') }),
    UNREAD: useDocumentCount({ ...base, ...tabFilter('UNREAD') }),
  };
  const countError = tabValues.some(value => counts[value].isError);

  const listParams = new URLSearchParams({ ...base, ...tabFilter(tab), sort, page: String(page), size: String(PAGE_SIZE) });
  const list = useQuery({
    queryKey: ['saved-documents', 'feed', listParams.toString()],
    queryFn: ({ signal }) => request<ResultPage>(`/documents?${listParams}`, undefined, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const items = list.data?.items ?? [];
  const ids = items.map(item => item.documentId);

  const readiness = useQuery({
    queryKey: ['ai', 'readiness', ids.join(',')],
    enabled: ids.length > 0 && !list.isPlaceholderData,
    queryFn: ({ signal }) => request<Record<string, Readiness>>(`/ai/readiness?ids=${ids.join(',')}`, undefined, signal),
    retry: false,
    refetchInterval: query => Object.values(query.state.data ?? {}).includes('RUNNING') ? 5000 : false,
  });
  const readyIds = ids.filter(id => readiness.data?.[id] === 'READY');
  const details = useQueries({
    queries: readyIds.map(id => ({
      queryKey: ['ai', id],
      queryFn: ({ signal }: { signal: AbortSignal }) => request<AiJobs>(`/ai/documents/${id}`, undefined, signal),
      retry: false,
    })),
  });

  function analysisFor(id: number): ItemAnalysis {
    const state = readiness.data?.[id];
    if (!state) return readiness.isError ? { kind: 'error' } : { kind: 'loading' };
    if (state !== 'READY') return { kind: 'state', state };
    const detail = details[readyIds.indexOf(id)];
    if (!detail || detail.isPending) return { kind: 'detail-loading' };
    const result = analysisCounts(detail.data);
    return result ? { kind: 'counts', counts: result } : { kind: 'detail-error' };
  }

  const lastBrief = useLastBrief();
  const briefEntries = lastBrief.query.data?.snapshot ?? [];
  const briefNumbers = new Map(briefEntries.map((entry, index) => [entry.documentId, index + 1]));

  const readinessState = list.isPending ? 'pending' : list.isError && !list.data ? 'list-error' : ids.length === 0 ? 'empty' : readiness.isError && !readiness.data ? 'error' : readiness.data ? 'ready' : 'pending';
  const activeFilters = [
    topicId && `주제: ${topicName ?? `#${topicId}`}`,
    sort !== 'FETCHED_DESC' && `정렬: ${sortOptions.find(option => option.value === sort)?.label}`,
  ].filter(Boolean) as string[];

  let listBody;
  if (list.isPending) {
    listBody = <><p className="visually-hidden" role="status">피드 자료를 불러오는 중입니다.</p><Skeleton lines={5} /><Skeleton lines={5} /></>;
  } else if (list.isError && !list.data) {
    listBody = <ErrorState title="피드 자료를 불러오지 못했습니다" description={list.error.message} onRetry={() => { void list.refetch(); }} />;
  } else if (items.length === 0) {
    listBody = (
      <div className="state-card feed-empty">
        <span className="state-icon" aria-hidden="true">◇</span>
        <h2>{tab === 'ALL' && !topicId ? '아직 수집한 자료가 없습니다' : '이 조건에 맞는 자료가 없습니다'}</h2>
        <p>검색 화면에서 주제를 검색하면 수집한 자료가 이곳에 표시됩니다.</p>
        <Link className="button-link" to="/search">새 자료 검색하기</Link>
      </div>
    );
  } else {
    listBody = (
      <>
        {list.isError && (
          <div className="feed-inline-alert" role="alert">
            <span>피드를 새로 불러오지 못해 이전 목록을 표시합니다.</span>
            <button type="button" className="button-secondary" onClick={() => { void list.refetch(); }}>다시 시도</button>
          </div>
        )}
        {readiness.isError && (
          <div className="feed-inline-alert" role="alert">
            <span>AI 분석 상태를 불러오지 못했습니다.</span>
            <button type="button" className="button-secondary" onClick={() => { void readiness.refetch(); }}>상태 다시 확인</button>
          </div>
        )}
        <div className="feed-items" aria-busy={list.isFetching}>
          {items.map(item => (
            <FeedItem key={item.documentId} document={item} topics={topics.data} selectedTopicId={topicId} briefNumber={briefNumbers.get(item.documentId)}
              analysis={analysisFor(item.documentId)} detailSearch={detailSearch} />
          ))}
        </div>
        <p className="feed-list-note">‘새 자료’는 수집한 지 24시간 이내인 자료입니다. 전체 {list.data?.totalElements ?? 0}건 중 {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + items.length}번째</p>
        <Pagination page={page} totalPages={list.data?.totalPages ?? 0} pending={list.isFetching} onChange={next => change({ page: next > 0 ? String(next) : '' })} />
      </>
    );
  }

  return (
    <section className="page-shell feed-page">
      <PageHeader
        title="리서치 피드"
        description="실제 출처 자료와 AI가 종합한 주제 브리프를 분리해 표시합니다."
        actions={(
          <button type="button" className="button-secondary" aria-expanded={panelOpen} aria-controls="feed-filter-panel" onClick={() => setPanelOpen(open => !open)}>
            필터 및 정렬{activeFilters.length > 0 ? ` (${activeFilters.length})` : ''}
          </button>
        )}
      />
      {panelOpen && (
        <section id="feed-filter-panel" className="card feed-filter-panel" aria-label="필터 및 정렬">
          <label className="feed-field">
            <span>주제</span>
            <select value={topicId} onChange={event => change({ topicId: event.target.value })} disabled={topics.isPending && !topicId}>
              <option value="">전체 주제</option>
              {topics.data?.map(topic => <option key={topic.id} value={String(topic.id)}>{topic.name}</option>)}
              {topicId && !topicName && <option value={topicId}>주제 #{topicId}</option>}
            </select>
            {topics.isPending && <span className="feed-field-help" role="status">주제 목록을 불러오는 중</span>}
            {topics.isError && <span className="feed-field-help" role="alert">주제 목록을 불러오지 못했습니다.</span>}
          </label>
          <label className="feed-field">
            <span>정렬</span>
            <select value={sort} onChange={event => change({ sort: event.target.value === 'FETCHED_DESC' ? '' : event.target.value })}>
              {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {activeFilters.length > 0 && (
            <button type="button" className="button-quiet" onClick={() => change({ topicId: '', sort: '' })}>조건 초기화</button>
          )}
        </section>
      )}
      {activeFilters.length > 0 && <p className="feed-active-filters">적용 중: {activeFilters.join(' · ')}</p>}

      <div className="layout-main-aside">
        <div className="stack">
          <FeedBriefCard lastBrief={lastBrief} detailSearch={detailSearch} />
          <section className="card feed-list" aria-labelledby="feed-list-title">
            <h2 className="visually-hidden" id="feed-list-title">피드 목록</h2>
            <ChipTabs ariaLabel="출처 유형과 읽기 상태로 보기" value={tab} onChange={value => change({ tab: value === 'ALL' ? '' : value })}
              items={tabValues.map(value => ({ value, label: tabLabels[value], count: counts[value].data }))} />
            {countError && <p className="feed-field-help" role="alert">일부 탭의 자료 수를 불러오지 못했습니다.</p>}
            {listBody}
          </section>
        </div>
        <FeedSummaryAside readyCount={readyIds.length} pageCount={ids.length} readinessState={readinessState} />
      </div>
    </section>
  );
}
