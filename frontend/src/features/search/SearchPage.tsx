import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState';
import { TopicPanel } from '../topics/TopicPanel';
import { DocumentsPanel } from '../documents/DocumentsPanel';
import { activeRun, request } from '../../api/client';
import type { Config, Run, Topic } from '../../api/client';
const statusLabel = { QUEUED: '검색 대기 중', RUNNING: '자료 수집 중', SUCCEEDED: '수집 완료', PARTIAL: '일부 자료 처리 실패', FAILED: '검색 실패' };
const reasonLabel: Record<string,string> = { TEST_MODE:'실제 웹 검색이 연결되지 않았습니다. 현재는 합성 자료로 기능만 시험합니다. 실제 검색은 서버의 Serper 키와 검색 모드를 설정한 뒤 사용할 수 있습니다.', PROVIDER_KEY_MISSING:'서버에 Serper API 키가 설정되지 않았습니다.', APPROVAL_REQUIRED:'외부 검색 호출 승인이 설정되지 않았습니다.', BUDGET_EXHAUSTED:'승인된 누적 검색 횟수를 모두 사용했습니다. 날짜가 바뀌어도 자동 초기화되지 않습니다.', PROVIDER_COOLDOWN:'검색 제공자의 요청 제한 대기 중입니다. 잠시 후 연결 상태를 다시 확인하세요.' };
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const cache = useQueryClient();
  const runId = Number(params.get('runId')) || 0;
  const [topicDraft, setTopicId] = useState<number | null>(null);
  const [queryDraft, setQuery] = useState<string | null>(null);
  const submitLock = useRef(false);
  const pendingRequest = useRef<{ topicId: number; query: string; requestKey: string; resolvedTopicId?: number } | null>(null);
  const config = useQuery({ queryKey: ['config'], queryFn: ({ signal }) => request<Config>('/config', undefined, signal) });
  const run = useQuery({
    queryKey: ['search-run', runId], enabled: runId > 0,
    queryFn: async ({ signal }) => { const result = await request<Run>(`/search-sessions/${runId}`, undefined, signal); if (!activeRun(result)) void cache.invalidateQueries({ queryKey: ['config'] }); return result; },
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
    onSuccess: created => { pendingRequest.current = null; setQuery(null); setTopicId(null); setParams({ runId: String(created.runId) }); },
    onSettled: () => { submitLock.current = false; }, retry: false,
  });
  const busy = create.isPending || (runId > 0 && (run.isPending || activeRun(run.data)));
  const searchAllowed = Boolean(!config.isError && config.data && (config.data.synthetic || config.data.externalSearchReady));
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
  return <section className="page-shell">
    <PageHeader eyebrow="SEARCH COLLECTION" title="새 자료 검색" description="검색어를 입력하고, 다시 읽을 자료는 내 보관함에 담으세요." />
    <form className="search-panel" onSubmit={submit}>
      <label htmlFor="search-query">검색어</label><div className="search-controls"><input id="search-query" type="search" readOnly={create.isPending} onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) e.preventDefault(); }} maxLength={200} required value={query} onChange={e => setQuery(e.target.value)} placeholder="검색어를 입력하세요" /><button disabled={busy || !query.trim() || (!searchAllowed && !canResume)}>{busy ? '처리 중…' : !searchAllowed && canResume ? '이전 요청 다시 확인' : config.data?.synthetic ? '테스트 검색 (외부 호출 없음)' : '검색하기'}</button></div>
      {!topicId && <p className="form-help">주제를 선택하지 않으면 ‘빠른 검색’에 기록합니다.</p>}
      {create.isError && <p role="alert">{create.error.message} 입력을 유지했습니다. 다시 제출할 수 있습니다.</p>}
    </form>
    {config.data && <div className="notice search-connection" role="status"><strong>{config.data.synthetic ? '실제 검색 연결 대기 · 테스트 모드' : config.data.externalSearchReady ? 'Serper 실제 검색 요청 가능' : '실제 검색을 사용할 수 없습니다'}</strong><span>{reasonLabel[config.data.searchReason] ?? '검색어·언어·지역이 Serper에 전송됩니다. 설정 확인은 실제 API 응답 성공을 보장하지 않습니다.'}</span><span>앱 누적 사용 {config.data.attempts} / 승인 상한 {config.data.maximum}회 · 남은 {config.data.remaining}회 (하루 기준 아님)</span><button className="button-secondary" disabled={config.isFetching} onClick={() => void config.refetch()}>연결 상태 다시 확인</button></div>}
    {config.isError && <ErrorState title="서버 설정 조회 실패" description={config.error.message} onRetry={() => { void config.refetch(); }} />}
    {(!searchAllowed || config.data?.synthetic) && <p><Link to="/documents">기존 자료 보기 →</Link></p>}
    <details><summary>관심 주제 선택 또는 만들기</summary>
      <TopicPanel selectedId={topicId} disabled={busy} onSelect={topic => { setTopicId(topic.id); setQuery(current => current?.trim() ? current : topic.query); }} />
    </details>
    {runId > 0 && run.isPending && <LoadingState title="검색 작업 확인 중" />}
    {run.isError && <ErrorState title="검색 작업 조회 실패" description={run.error.message} onRetry={() => { void run.refetch(); }} />}
    {run.data && <div className="notice" role="status"><strong>{statusLabel[run.data.status]}</strong><span>“{run.data.query}” · 발견 {run.data.discoveredCount} · 저장 {run.data.processedCount} · 실패 {run.data.failureCount}{run.data.errorCode && ` · ${run.data.errorCode}`}</span></div>}
    {run.data?.status === 'FAILED' && <div className="notice"><strong>검색을 완료하지 못했습니다</strong><span>검색어를 확인한 뒤 위에서 다시 검색하세요.</span><Link to={run.data.synthetic ? '/library?includeSynthetic=true' : '/library'}>내 보관함 열기 →</Link><Link to={run.data.synthetic ? '/documents?includeSynthetic=true' : '/documents'}>기존 자료 확인 →</Link></div>}
    {run.data?.status === 'PARTIAL' && <p className="form-help">아래에서 저장된 자료를 먼저 볼 수 있습니다.</p>}
    {run.data?.status === 'SUCCEEDED' && run.data.discoveredCount === 0 && <p>검색 결과가 없습니다. 위 검색창에서 검색어를 바꾸거나 <Link to="/documents">기존 자료를 확인하세요.</Link></p>}
    {activeRun(run.data) && <LoadingState title="검색 결과를 수집하고 있습니다" description="완료되면 저장된 결과를 표시합니다." />}
    {run.data && !activeRun(run.data) && run.data.status !== 'FAILED' && <DocumentsPanel key={runId} runId={runId} />}
    {!runId && <EmptyState title="첫 검색을 시작하세요" description="검색을 마친 뒤 페이지를 새로고침해도 결과가 유지됩니다." />}
  </section>;
}
