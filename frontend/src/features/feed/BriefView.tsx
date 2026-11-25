/**
 * 자료 요약 모음 결과 화면. '요약의 요약'이 일반론으로 흐르지 않도록
 * 교차 정리의 모든 문장을 [자료 번호] 근거 칩과 원래 주장·인용으로 되짚을 수 있게 보여 준다.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { request, sourceLabel } from '../../api/client';
import type { AiResult, Brief, BriefItem, BriefRef } from '../../api/queries';
import { meaningfulLimitations, parseAiResult } from '../../api/queries';
import { ChipTabs, Skeleton, Tag } from '../../components/ui';
import { formatKstDateTime, sourceTone } from '../../lib/format';

type View = 'overview' | 'common' | 'differences' | 'checks' | 'sources';

const synthesisErrors: Record<string, string> = {
  AI_NOT_RUNNING: 'Ollama가 실행되지 않아 교차 정리를 만들지 못했습니다.',
  MODEL_MISSING: '설정된 모델이 설치되어 있지 않습니다.',
  AI_TIMEOUT: '모델 응답 시간이 초과됐습니다.',
  AI_QUEUE_FULL: 'AI 대기열이 가득 찼습니다. 잠시 후 다시 요청하세요.',
  NO_VALID_EVIDENCE: '자료의 주장과 연결되는 정리 항목이 없어 결과를 버렸습니다. 다시 요청하거나 자료 구성을 바꿔 보세요.',
  INVALID_SCHEMA: '모델이 정리 형식을 지키지 않았습니다. 다시 요청하세요.',
  INCOMPLETE_OUTPUT: '모델 응답이 끝까지 생성되지 않았습니다. 다시 요청하세요.',
  INTERRUPTED: '서버가 재시작되어 정리가 중단됐습니다.',
};

/** 스냅샷 + 자료별 분석 결과를 미리 풀어 둔다. */
function entriesOf(brief: Brief) {
  return brief.snapshot.map((entry, index) => ({ entry, index, result: parseAiResult(entry.analysis?.result_json), snippet: entry.analysis?.input_type === 'SNIPPET' }));
}
type Entry = ReturnType<typeof entriesOf>[number];

function claimOf(entries: Entry[], ref: BriefRef) {
  const entry = entries[ref.source];
  return entry ? { entry, claim: entry.result?.claims[ref.claim] } : undefined;
}

/** [1][3] 처럼 근거가 된 자료 번호. 마우스를 올리면 자료 제목이 보인다. */
function SourceChips({ refs, entries }: { refs: BriefRef[]; entries: Entry[] }) {
  const sources = [...new Set(refs.map(ref => ref.source))].sort((a, b) => a - b);
  return <span className="bv-chips" aria-label={`근거 자료 ${sources.map(s => s + 1).join(', ')}번`}>
    {sources.map(s => <span key={s} className="bv-chip" title={entries[s]?.entry.title}>{s + 1}</span>)}
  </span>;
}

/** 정리 항목 하나: 문장 + 근거 칩 + (펼치면) 근거가 된 원래 주장과 인용. */
function ItemRow({ item, entries, heading, detailLink }: { item: BriefItem; entries: Entry[]; heading?: string; detailLink: (documentId: number) => string }) {
  return <li className="bv-item">
    {heading && <span className="bv-item-topic">{heading}</span>}
    <p className="bv-item-text">{item.text} <SourceChips refs={item.refs} entries={entries} /></p>
    <details className="bv-trace">
      <summary>근거 주장 {item.refs.length}개 보기</summary>
      <ul>
        {item.refs.map((ref, i) => {
          const found = claimOf(entries, ref);
          if (!found) return null;
          return <li key={i}>
            <span className="bv-chip" aria-hidden="true">{ref.source + 1}</span>
            <div>
              <p>{found.claim?.text ?? '원래 주장을 찾을 수 없습니다.'}</p>
              {found.claim?.quote && <q>{found.claim.quote}</q>}
              <Link className="text-link" to={detailLink(found.entry.entry.documentId)}>{found.entry.entry.title} →</Link>
            </div>
          </li>;
        })}
      </ul>
    </details>
  </li>;
}

function SourceCard({ e, detailLink }: { e: Entry; detailLink: (documentId: number) => string }) {
  const [open, setOpen] = useState(false);
  const r: AiResult | undefined = e.result;
  const limits = r ? meaningfulLimitations(r.limitations) : [];
  return <article className="bv-source">
    <div className="bv-source-head">
      <span className="bv-chip bv-chip-lg" aria-hidden="true">{e.index + 1}</span>
      <div className="bv-source-title">
        <Link to={detailLink(e.entry.documentId)}>{e.entry.title}</Link>
        <span className="bv-source-tags">
          <Tag tone={sourceTone[e.entry.sourceType] ?? 'gray'}>{sourceLabel[e.entry.sourceType] ?? '기타'}</Tag>
          {e.snippet ? <Tag tone="orange">검색 발췌 기반</Tag> : <Tag tone="green">본문 기반</Tag>}
        </span>
      </div>
    </div>
    {r ? <>
      <p className="bv-source-summary">{r.summary}</p>
      <button type="button" className="button-quiet bv-toggle" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? '핵심 주장 접기' : `핵심 주장 ${r.claims.length}개·근거 보기`}</button>
      {open && <ol className="bv-claims">
        {r.claims.map((c, i) => <li key={i}><span>{c.text}</span>{c.quote.trim() && <q>{c.quote}</q>}</li>)}
        {limits.length > 0 && <li className="bv-claims-limit"><strong>한계</strong> {limits.join(' · ')}</li>}
      </ol>}
    </> : <p className="bv-muted" role="alert">저장된 분석 결과를 읽을 수 없습니다. 상세 화면에서 다시 확인하세요.</p>}
  </article>;
}

export function BriefView({ brief, detailLink }: { brief: Brief; detailLink: (documentId: number) => string }) {
  const entries = entriesOf(brief);
  const cache = useQueryClient();
  const s = brief.synthesis ?? undefined;
  const status = brief.synthesisStatus ?? 'NONE';
  const counts = { common: s?.common.length ?? 0, differences: s?.differences.length ?? 0, checks: s?.checks.length ?? 0 };
  const [view, setView] = useState<View>(s ? 'overview' : 'sources');
  const shown: View = !s && view !== 'sources' ? 'sources' : view;
  const snippetCount = entries.filter(e => e.snippet).length;
  const retry = useMutation({
    mutationFn: () => request<{ queued: boolean }>(`/ai/briefs/${brief.briefId}/synthesis`, {}),
    onSettled: () => cache.invalidateQueries({ queryKey: ['brief', brief.briefId] }),
    retry: false,
  });
  const running = status === 'QUEUED' || status === 'RUNNING';
  const outdatedModel = Boolean(s && brief.synthesisModel && brief.currentModel && brief.synthesisModel !== brief.currentModel);

  const tabs: { value: View; label: string; count?: number }[] = [
    ...(s ? [
      { value: 'overview' as View, label: '한눈에 보기' },
      { value: 'common' as View, label: '공통점', count: counts.common },
      { value: 'differences' as View, label: '차이·고유 내용', count: counts.differences },
      { value: 'checks' as View, label: '원문 확인 필요', count: counts.checks },
    ] : []),
    { value: 'sources', label: '자료별 요약', count: entries.length },
  ];

  return <div className="bv">
    {brief.question && <div className="bv-question">
      <span className="bv-label">내 질문</span>
      <p>{brief.question}</p>
      {s?.answer
        ? <div className="bv-answer"><span className="bv-label">근거 기반 답</span><ul className="bv-list"><ItemRow item={s.answer} entries={entries} detailLink={detailLink} /></ul></div>
        : s && <p className="bv-muted">선택한 자료의 주장만으로는 이 질문에 답할 근거를 찾지 못했습니다.</p>}
    </div>}

    {snippetCount > 0 && <p className="bv-warn">자료 {snippetCount}건은 검색 발췌문으로만 분석되어 근거가 짧습니다. 상세 화면에서 본문을 확보해 다시 분석하면 정리가 더 정확해집니다.</p>}

    {running && <div className="bv-state" role="status"><strong>교차 정리 생성 중…</strong><span>로컬 AI가 자료끼리의 공통점·차이를 비교하고 있습니다. 그동안 자료별 요약을 먼저 볼 수 있습니다.</span><Skeleton lines={2} /></div>}
    {status === 'FAILED' && <div className="bv-state bv-state-error" role="alert">
      <strong>교차 정리를 만들지 못했습니다</strong>
      <span>{synthesisErrors[brief.synthesisError ?? ''] ?? '로컬 AI 처리 중 문제가 발생했습니다.'} 자료별 요약은 그대로 볼 수 있습니다.</span>
      <button type="button" className="button-secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>{retry.isPending ? '요청 중…' : '교차 정리 다시 요청'}</button>
    </div>}
    {status === 'NONE' && <div className="bv-state">
      <strong>이 모음에는 교차 정리가 없습니다</strong>
      <span>이전 버전에서 만든 모음입니다. 공통점·차이·확인 필요 항목으로 다시 정리할 수 있습니다.</span>
      <button type="button" className="button-secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>교차 정리 만들기</button>
    </div>}
    {status === 'NOT_APPLICABLE' && entries.length < 2 && <p className="bv-muted">자료가 1건이라 교차 정리 없이 자료 요약만 표시합니다. 2건 이상 고르면 공통점과 차이를 함께 정리합니다.</p>}
    {retry.isError && <p className="bv-state bv-state-error" role="alert">{retry.error.message}</p>}

    <ChipTabs<View> ariaLabel="요약 모음 보기 방식" value={shown} onChange={setView} items={tabs} />

    {shown === 'overview' && s && <div className="bv-panel">
      <p className="bv-overview">{s.overview}</p>
      <div className="bv-matrix" role="table" aria-label="자료별 기여">
        <div className="bv-matrix-row bv-matrix-head" role="row">
          <span role="columnheader">자료</span><span role="columnheader">공통</span><span role="columnheader">차이·고유</span><span role="columnheader">확인 필요</span>
        </div>
        {entries.map(e => {
          const used = (items: BriefItem[]) => items.filter(item => item.refs.some(ref => ref.source === e.index)).length;
          return <div className="bv-matrix-row" role="row" key={e.index}>
            <span role="cell" className="bv-matrix-title"><span className="bv-chip" aria-hidden="true">{e.index + 1}</span><Link to={detailLink(e.entry.documentId)}>{e.entry.title}</Link></span>
            <span role="cell" data-label="공통">{used(s.common) || '–'}</span>
            <span role="cell" data-label="차이·고유">{used(s.differences) || '–'}</span>
            <span role="cell" data-label="확인 필요">{used(s.checks) || '–'}</span>
          </div>;
        })}
      </div>
      <div className="bv-jump">
        {counts.common > 0 && <button type="button" className="button-secondary" onClick={() => setView('common')}>공통점 {counts.common}개 →</button>}
        {counts.differences > 0 && <button type="button" className="button-secondary" onClick={() => setView('differences')}>차이·고유 {counts.differences}개 →</button>}
        {counts.checks > 0 && <button type="button" className="button-secondary" onClick={() => setView('checks')}>확인 필요 {counts.checks}개 →</button>}
      </div>
    </div>}
    {shown === 'common' && s && <div className="bv-panel">
      <p className="bv-panel-help">두 자료 이상이 함께 말하는 내용입니다. 자료가 서로 독립적인지(같은 원문을 옮긴 글인지)는 직접 확인하세요.</p>
      {s.common.length ? <ul className="bv-list">{s.common.map((item, i) => <ItemRow key={i} item={item} entries={entries} detailLink={detailLink} />)}</ul> : <p className="bv-muted">여러 자료가 함께 말하는 내용을 찾지 못했습니다. 자료마다 다루는 내용이 다릅니다.</p>}
    </div>}
    {shown === 'differences' && s && <div className="bv-panel">
      <p className="bv-panel-help">자료마다 다르게 말하거나 한 자료만 다루는 내용입니다. 하나의 결론으로 합치지 않았습니다.</p>
      {s.differences.length ? <ul className="bv-list">{s.differences.map((item, i) => <ItemRow key={i} item={item} heading={item.topic} entries={entries} detailLink={detailLink} />)}</ul> : <p className="bv-muted">눈에 띄는 차이를 찾지 못했습니다.</p>}
    </div>}
    {shown === 'checks' && s && <div className="bv-panel">
      <p className="bv-panel-help">자료끼리 충돌하거나 발췌만으로 확정할 수 없는 내용입니다. 원문에서 직접 확인하세요.</p>
      {s.checks.length ? <ul className="bv-list">{s.checks.map((item, i) => <ItemRow key={i} item={item} entries={entries} detailLink={detailLink} />)}</ul> : <p className="bv-muted">추가로 확인할 항목을 찾지 못했습니다.</p>}
    </div>}
    {shown === 'sources' && <div className="bv-panel bv-sources">
      {entries.map(e => <SourceCard key={e.entry.documentId} e={e} detailLink={detailLink} />)}
    </div>}

    <p className="bv-foot">
      생성 {formatKstDateTime(brief.createdAt)} 시점의 분석 스냅샷 · 교차 정리는 자료별 핵심 주장만 사용하며 근거 번호가 없는 문장은 표시하지 않습니다.
      {outdatedModel && <> · 현재 모델과 다른 모델({brief.synthesisModel})로 만든 정리입니다. <button type="button" className="button-quiet" disabled={retry.isPending || running} onClick={() => retry.mutate()}>현재 모델로 다시 정리</button></>}
    </p>
  </div>;
}
