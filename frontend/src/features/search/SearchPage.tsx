import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState';
import { Card } from '../../components/ui';
import { TopicPanel } from '../topics/TopicPanel';
import { activeRun, request } from '../../api/client';
import type { Config, Run, Topic } from '../../api/client';
import { RecentSearches } from './RecentSearches';
import { RunView } from './RunView';
import type { Observation } from './RunView';
import { errorLabel, providerLabel, reasonLabel, statusLabel } from './searchModel';
import { useRecentHistory } from './useRunHistory';
import { useTopics } from '../../api/queries';
import type { RunDetail } from './searchModel';
import './search.css';
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const cache = useQueryClient();
  const runId = Number(params.get('runId')) || 0;
  const [topicDraft, setTopicId] = useState<number | null>(null);
  const [queryDraft, setQuery] = useState<string | null>(null);
  // 폴링으로 관측한 상태 변화(이 화면에서만 유지). runId가 바뀌면 새로 시작한다.
  const [observed, setObserved] = useState<{ runId: number; status?: Run['status']; entries: Observation[] }>({ runId: 0, entries: [] });
  const submitLock = useRef(false);
  // 제출 성공 직후 세션 카드로 스크롤·포커스할 runId.
  const [focusRunId, setFocusRunId] = useState(0);
  const clearFocus = useCallback(() => setFocusRunId(0), []);
  const topics = useTopics();
  const recent = useRecentHistory();
  const pendingRequest = useRef<{ topicId: number; query: string; requestKey: string; resolvedTopicId?: number } | null>(null);
  function observe(result: Run, note?: string) {
    const at = new Date().toISOString();
    setObserved(prev => {
      const same = prev.runId === result.runId;
      if (same && prev.status === result.status) return prev;
      const counts = result.status === 'SUCCEEDED' || result.status === 'PARTIAL' ? ` · 발견 ${result.discoveredCount} · 저장 ${result.processedCount}` : '';
      const text = note ?? `${statusLabel[result.status]} 확인${counts}${result.errorCode ? ` · ${errorLabel(result.errorCode)}` : ''}`;
      return { runId: result.runId, status: result.status, entries: [...(same ? prev.entries : []), { at, text }] };
    });
  }
  const config = useQuery({ queryKey: ['config'], queryFn: ({ signal }) => request<Config>('/config', undefined, signal) });
  const run = useQuery({
    queryKey: ['search-run', runId], enabled: runId > 0,
    queryFn: async ({ signal }) => { const result = await request<RunDetail>(`/search-sessions/${runId}`, undefined, signal); observe(result); if (!activeRun(result)) void cache.invalidateQueries({ queryKey: ['config'] }); return result; },
    refetchInterval: q => activeRun(q.state.data) && !q.state.error ? 500 : false, retry: false,
  });
  const topicId = topicDraft ?? run.data?.topicId ?? 0;
  const query = queryDraft ?? run.data?.query ?? '';
  const create = useMutation({
    mutationFn: async (draft: NonNullable<typeof pendingRequest.current>) => {
      let selectedTopic = draft.resolvedTopicId || draft.topicId;
      if (!selectedTopic) {
        const name = '빠른 검색';
        const topics = await request<Topic[]>('/topics');
        const topic = topics.find(item => item.name === name)
          ?? await request<Topic>('/topics', { name, query: draft.query });
        selectedTopic = topic.id;
        draft.resolvedTopicId = selectedTopic;
        void cache.invalidateQueries({ queryKey: ['topics'] });
      }
      return request<Run>('/search-sessions', { topicId: selectedTopic, query: draft.query, requestKey: draft.requestKey });
    },
    onSuccess: created => { pendingRequest.current = null; observe(created, '검색 요청 접수 (서버 응답 받음)'); setFocusRunId(created.runId); cache.setQueryData(['search-run', created.runId], created); setQuery(null); setTopicId(null); setParams({ runId: String(created.runId) }); },
    onSettled: () => { submitLock.current = false; }, retry: false,
  });
  const busy = create.isPending || (runId > 0 && (run.isPending || activeRun(run.data)));
  const searchAllowed = Boolean(!config.isError && config.data && config.data.externalSearchReady);
  const pending = create.isError ? create.variables : undefined;
  const canResume = pending?.query === query.trim() && pending.topicId === topicId && Boolean(pending.resolvedTopicId || pending.topicId);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (submitLock.current || busy || !query.trim() || (!searchAllowed && !canResume)) return;
    submitLock.current = true;
    // Preserve the key after an ambiguous network failure to avoid another paid request.
    if (!pendingRequest.current || pendingRequest.current.topicId !== topicId || pendingRequest.current.query !== query.trim()) {
      pendingRequest.current = { topicId, query: query.trim(), requestKey: crypto.randomUUID() };
    }
    create.mutate(pendingRequest.current);
  }
  const observations = observed.runId === runId ? observed.entries : [];
  const compact = runId > 0;
  const topicName = topics.data?.find(topic => topic.id === topicId)?.name;
  const searchButton = <button disabled={busy || !query.trim() || (!searchAllowed && !canResume)} title={config.data && !searchAllowed ? reasonLabel[config.data.searchReason] : undefined}>{busy ? '처리 중…' : !searchAllowed && canResume ? '이전 요청 다시 확인' : '검색하기'}</button>;
  const settings = <div className="search-form-grid">
    <TopicPanel selectedId={topicId} disabled={busy} onSelect={topic => { setTopicId(topic.id); setQuery(current => current?.trim() ? current : topic.query); }} />
    <div className="search-config">
      {config.isPending && <p className="form-help" role="status">검색 설정을 확인하는 중…</p>}
      {config.isError && <ErrorState title="서버 설정 조회 실패" description={config.error.message} onRetry={() => { void config.refetch(); }} />}
    </div>
  </div>;
  const hasRecent = Boolean(recent.data?.items.length);
  return <section className="page-shell search-page">
    <PageHeader title="새 자료 검색" description="저장된 자료를 먼저 보여주고, 외부 출처 수집과 AI 분석은 백그라운드에서 진행합니다." />
    {compact
      ? <div className="card search-form-card search-form-compact">
        <form className="search-form" onSubmit={submit} aria-label="새 검색">
          <label htmlFor="search-query" className="visually-hidden">검색어</label>
          <div className="search-compact-row">
            <input id="search-query" type="search" readOnly={create.isPending} onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) e.preventDefault(); }} maxLength={200} required value={query} onChange={e => setQuery(e.target.value)} placeholder="검색어를 입력하세요" />
            <span className="search-compact-topic">{topicId ? <>주제 · <strong>{topicName ?? `#${topicId}`}</strong></> : '주제 미선택 · ‘빠른 검색’에 기록'}</span>
            {searchButton}
          </div>
          {create.isError && <p role="alert" className="search-form-error">{create.error.message} 입력을 유지했습니다. 다시 제출할 수 있습니다.</p>}
          {config.isError && <p role="alert" className="search-form-error">서버 설정을 불러오지 못해 검색할 수 없습니다. 아래 ‘주제·검색 설정’에서 다시 시도하세요.</p>}
          {config.data && !searchAllowed && <p className="form-help" role="status">{reasonLabel[config.data.searchReason] ?? '실제 검색을 사용할 수 없습니다.'}</p>}
        </form>
        <details className="search-settings">
          <summary>주제 선택·검색 설정{config.data ? ` · ${providerLabel(config.data.provider)} · 남은 ${config.data.remaining}회` : ''}</summary>
          {settings}
        </details>
      </div>
      : <Card className="search-form-card" title="검색 조건" aside={config.data ? `검색 제공자 · ${providerLabel(config.data.provider)}` : undefined}>
        <form className="search-form" onSubmit={submit}>
          <label htmlFor="search-query">검색어</label><div className="search-controls"><input id="search-query" type="search" readOnly={create.isPending} onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) e.preventDefault(); }} maxLength={200} required value={query} onChange={e => setQuery(e.target.value)} placeholder="검색어를 입력하세요" />{searchButton}</div>
          {!topicId && <p className="form-help">주제를 선택하지 않으면 ‘빠른 검색’에 기록합니다.</p>}
          {create.isError && <p role="alert" className="search-form-error">{create.error.message} 입력을 유지했습니다. 다시 제출할 수 있습니다.</p>}
        </form>
        {settings}
      </Card>}
    {runId > 0 && run.isPending && <LoadingState title="검색 작업 확인 중" />}
    {run.isError && !run.data && <ErrorState title="검색 작업 조회 실패" description={run.error.message} onRetry={() => { void run.refetch(); }} />}
    {run.isError && run.data && <div className="notice search-refresh-error" role="alert"><strong>검색 상태를 갱신하지 못했습니다</strong><span>마지막으로 받은 상태를 표시합니다. {run.error.message}</span><button type="button" className="button-secondary" disabled={run.isFetching} onClick={() => { void run.refetch(); }}>상태 다시 확인</button></div>}
    {run.data && <RunView run={run.data} observations={observations} focusRequested={focusRunId === run.data.runId} onFocused={clearFocus} />}
    {!runId && <div className="layout-main-aside search-empty-layout">
      {hasRecent
        ? <EmptyState title="새 검색을 시작하거나 최근 검색을 다시 여세요" description="위에서 검색어를 입력하거나, 최근 검색 이력에서 이전 세션의 결과를 열 수 있습니다. 저장된 자료는 바로 열람할 수 있고 AI 분석은 자료 상세에서 요청합니다." />
        : <EmptyState title="첫 검색을 시작하세요" description="검색을 마친 뒤 페이지를 새로고침해도 결과가 유지됩니다. 저장된 자료는 바로 열람할 수 있고, AI 분석은 자료 상세에서 요청합니다." />}
      <RecentSearches />
    </div>}
  </section>;
}
