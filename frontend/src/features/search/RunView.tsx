import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { activeRun } from '../../api/client';
import { useAiHealth, useTopics } from '../../api/queries';
import { Card, Notice, Skeleton, StatTile, StepList, Tag, Timeline } from '../../components/ui';
import { formatKstTime } from '../../lib/format';
import { DocumentsPanel } from '../documents/DocumentsPanel';
import { buildSteps, errorLabel, providerLabel, statusChip, statusLabel } from './searchModel';
import type { RunDetail } from './searchModel';
import { useRunHistory } from './useRunHistory';

/** 이 화면이 폴링 중 관측한 상태 변화. */
export type Observation = { at: string; text: string };

/** 검색 세션이 있을 때의 본문: 세션 카드·단계, KPI, 수집 기록, 안내, 먼저 표시된 원문 자료. */
export function RunView({ run, observations, focusRequested, onFocused }: { run: RunDetail; observations: Observation[]; focusRequested: boolean; onFocused: () => void }) {
  const sessionRef = useRef<HTMLElement>(null);
  const titleId = useId();
  // 새 검색을 제출한 직후에는 세션 카드로 이동해 진행 상황을 바로 보여 준다(움직임 줄이기 설정 존중).
  useEffect(() => {
    const element = sessionRef.current;
    if (!focusRequested || !element) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    element.focus({ preventScroll: true });
    onFocused();
  }, [focusRequested, onFocused]);
  const topics = useTopics();
  const health = useAiHealth();
  const { lookup, refetch, isFetching } = useRunHistory(run);
  const active = activeRun(run);
  const chip = statusChip[run.status];
  const topicName = topics.data?.find(topic => topic.id === run.topicId)?.name ?? (topics.isPending ? '주제 확인 중' : `주제 #${run.topicId}`);
  const provider = providerLabel(run.provider);
  const item = lookup.state === 'found' ? lookup.item : undefined;
  const empty = active || lookup.state === 'loading' ? '집계 중' : '–';
  const libraryLink = '/library';
  const documentsLink = '/documents';

  const timeline = [
    ...(run.startedAt ? [{ at: run.startedAt, text: '서버 기록 · 작업 시작', tone: 'default' as const }] : []),
    ...observations.map((entry, index) => ({ at: entry.at, text: entry.text, tone: active && index === observations.length - 1 ? 'active' as const : 'default' as const })),
    ...(run.finishedAt ? [{ at: run.finishedAt, text: `서버 기록 · 작업 종료 (${chip.label})`, tone: 'default' as const }] : []),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map(entry => ({ time: formatKstTime(entry.at), text: entry.text, tone: entry.tone }));

  return <div className="search-run-layout">
    <div className="search-run-main">
      <article ref={sessionRef} tabIndex={-1} className="card search-session-card" aria-labelledby={titleId}>
        <div className="card-tags">
          <Tag tone="purple">검색 세션 #{run.runId}</Tag>
          <Tag tone={chip.tone}>{chip.label}</Tag>
          <Tag tone="blue">실제 검색</Tag>
        </div>
        <h2 className="search-session-title" id={titleId}>{run.query}</h2>
        <p className="search-session-desc">{topicName} · {provider}</p>
        <p className="search-session-status" role="status"><strong>{statusLabel[run.status]}</strong> · 발견 {run.discoveredCount} · 저장 {run.processedCount} · 본문 확인 불가 {run.failureCount}{run.errorCode && ` · ${errorLabel(run.errorCode)}`}</p>
        <StepList steps={buildSteps(run, lookup, health)} />
        {run.errorCode && <details className="search-error-info"><summary>오류 정보</summary><p>서버 오류 코드: <code>{run.errorCode}</code></p></details>}
      </article>

      <Card className="search-results-card" title="먼저 표시된 원문 자료" aside="AI 요약 없이 열람 가능">
        {active && <>
          <p className="form-help search-results-wait" role="status">검색 결과를 수집하고 있습니다. 완료되면 저장된 결과를 표시합니다.</p>
          <div className="search-skeletons"><Skeleton lines={4} /><Skeleton lines={4} /></div>
        </>}
        {run.status === 'FAILED' && <div className="notice search-failed" role="alert"><strong>검색을 완료하지 못했습니다</strong><span>검색어를 확인한 뒤 위에서 다시 검색하세요.</span><Link to={libraryLink}>내 보관함 열기 →</Link><Link to={documentsLink}>기존 자료 확인 →</Link></div>}
        {run.status === 'PARTIAL' && <p className="form-help">일부 본문 확인 불가: 일부 자료는 본문을 확인하지 못했습니다. 아래에서 저장된 자료를 먼저 볼 수 있습니다.</p>}
        {run.status === 'SUCCEEDED' && run.discoveredCount === 0 && <p className="search-zero">검색 결과가 없습니다. 위 검색창에서 검색어를 바꾸거나 <Link to="/documents">기존 자료를 확인하세요.</Link></p>}
        {!active && run.status !== 'FAILED' && !(run.status === 'SUCCEEDED' && run.discoveredCount === 0) && <div className="search-documents"><DocumentsPanel key={run.runId} runId={run.runId} /></div>}
      </Card>
    </div>

    <div className="search-run-side">
      <section className="search-kpis" aria-label="이 검색 세션 집계">
        <div className="search-kpi-grid">
          <StatTile label="발견" value={item ? item.raw ?? item.valid : empty} hint={item ? (item.raw == null ? `원시 수신 미기록 · 유효 ${item.valid}` : `유효 ${item.valid} · 제외 ${item.excluded ?? '미기록'}`) : undefined} />
          <StatTile label="신규 고유" tone={item ? 'green' : undefined} value={item ? item.created : empty} hint={item ? '처음 저장된 자료' : undefined} />
          <StatTile label="기존 자료" tone={item ? 'purple' : undefined} value={item ? item.existing : empty} hint={item ? '이미 저장돼 있던 자료' : undefined} />
          <StatTile label="확정 중복" tone={item ? 'orange' : undefined} value={item ? item.duplicates : empty} hint={item ? '같은 자료로 정리된 결과' : undefined} />
        </div>
        <p className="search-kpi-note" role="status">{lookup.reason}{(lookup.state === 'error' || lookup.state === 'missing') && <button type="button" className="button-quiet search-kpi-retry" disabled={isFetching} onClick={refetch}>{isFetching ? '다시 찾는 중…' : '다시 찾기'}</button>}</p>
      </section>

      <Card className="search-log-card" title="실시간 수집 기록">
        <p className="search-log-note">이 화면에서 관측한 기록입니다. 새로고침하면 서버 시작·종료 시각만 남습니다.</p>
        {timeline.length ? <Timeline entries={timeline} /> : <p className="form-help">아직 기록이 없습니다.</p>}
      </Card>

      <Notice title="검색 결과는 먼저 사용할 수 있습니다.">Ollama가 느리거나 중단돼도 원문 자료와 읽기 보관함은 정상 동작합니다.</Notice>
    </div>
  </div>;
}
