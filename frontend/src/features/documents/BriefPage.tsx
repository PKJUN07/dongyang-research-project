import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { request } from '../../api/client';
import type { ResultPage } from '../../api/client';
import type { Brief, BriefEntry, Readiness } from '../../api/queries';
import { PageHeader } from '../../components/PageHeader';
import { Card, Skeleton, Tag } from '../../components/ui';
import type { TagTone } from '../../components/ui';
import { rememberBrief } from '../../lib/storage';
import { BriefView } from '../feed/BriefView';
import '../feed/brief.css';

const labels: Record<Readiness, string> = { READY: '분석 완료', RUNNING: '분석 중', STALE: '재분석 필요', NOT_ANALYZED: '미분석', FAILED: '분석 재시도 필요' };
const tones: Record<Readiness, TagTone> = { READY: 'green', RUNNING: 'blue', STALE: 'orange', NOT_ANALYZED: 'gray', FAILED: 'red' };
/** 질문 예시. 누르면 질문 칸에 채운다. */
const questionExamples = ['자료마다 권장하는 방법이 어떻게 다른가?', '공통으로 지적하는 문제점은?', '수치나 날짜가 서로 다른 부분은?'];

export default function BriefPage() {
  const [ids, setIds] = useState<number[]>([]);
  const [question, setQuestion] = useState('');
  const [params, setParams] = useSearchParams();
  const briefId = Number(params.get('briefId'));
  const hasBrief = Number.isSafeInteger(briefId) && briefId > 0;
  const docs = useQuery({ queryKey: ['saved-documents', 'brief'], queryFn: () => request<ResultPage>('/documents?size=100&sort=FETCHED_DESC') });
  const visibleIds = docs.data?.items.map(d => d.documentId) ?? [];
  const status = useQuery({
    queryKey: ['ai', 'readiness', visibleIds.join(',')], enabled: visibleIds.length > 0,
    queryFn: ({ signal }) => request<Record<string, Readiness>>('/ai/readiness?ids=' + visibleIds.join(','), undefined, signal), retry: false,
    refetchInterval: q => Object.values(q.state.data ?? {}).includes('RUNNING') ? 2000 : false,
  });
  const ready = ids.length > 0 && ids.every(id => visibleIds.includes(id) && status.data?.[id] === 'READY');
  const snapshot = useQuery({
    queryKey: ['brief', briefId], enabled: hasBrief, retry: false,
    queryFn: async ({ signal }) => {
      const brief = await request<Brief>('/ai/briefs/' + briefId, undefined, signal);
      rememberBrief(brief.briefId);
      return brief;
    },
    // 교차 정리가 진행 중이면 결과가 저장될 때까지 다시 확인한다.
    refetchInterval: q => ['QUEUED', 'RUNNING'].includes(q.state.data?.synthesisStatus ?? '') ? 2500 : false,
  });
  const create = useMutation({
    mutationFn: () => request<{ briefId: number; documents: BriefEntry[] }>('/ai/briefs', { ids, question: question.trim() || undefined }),
    onSuccess: result => { rememberBrief(result.briefId); setParams({ briefId: String(result.briefId) }); setIds([]); },
    retry: false,
  });
  const noneReady = docs.data && visibleIds.length > 0 && status.data && !Object.values(status.data).includes('READY');
  const [selectOpen, setSelectOpen] = useState(!hasBrief);
  const detailLink = (documentId: number) => `/documents/${documentId}?returnTo=${encodeURIComponent('/brief?briefId=' + briefId)}`;

  return (
    <section className="page-shell briefpage">
      <PageHeader
        title="자료 요약 모음"
        description="AI 분석을 마친 자료를 2~5개 고르면, 자료끼리 공통점·차이·원문 확인이 필요한 부분을 나눠 정리합니다. 모든 문장은 어느 자료의 어떤 주장에서 나왔는지 번호로 연결됩니다."
        actions={<Link className="button-link-secondary" to="/feed">리서치 피드로</Link>}
      />

      {snapshot.isPending && snapshot.fetchStatus === 'fetching' && <Card><p role="status">저장된 요약 모음을 불러오는 중…</p><Skeleton lines={4} /></Card>}
      {snapshot.isError && (
        <div className="briefpage-alert" role="alert">
          <span>{snapshot.error.message}</span>
          <button type="button" className="button-secondary" onClick={() => void snapshot.refetch()}>모음 다시 불러오기</button>
        </div>
      )}
      {snapshot.data && (
        <section className="card briefpage-result" aria-label="자료 요약 모음 결과">
          <div className="briefpage-result-head">
            <h2 className="card-title">요약 모음 #{snapshot.data.briefId}</h2>
            <div className="card-tags">
              <Tag tone="purple">AI 생성</Tag>
              <span className="briefpage-badge">자료 {snapshot.data.snapshot.length}건</span>
            </div>
          </div>
          <BriefView brief={snapshot.data} detailLink={detailLink} />
        </section>
      )}

      <Card title="새 요약 모음 만들기" aside={`${ids.length}/5 선택`} className="briefpage-select">
        {hasBrief && <button type="button" className="button-secondary briefpage-open" aria-expanded={selectOpen} aria-controls="briefpage-builder" onClick={() => setSelectOpen(v => !v)}>{selectOpen ? '자료 선택 접기' : '다른 자료로 새 모음 만들기'}</button>}
        <div id="briefpage-builder" hidden={!selectOpen}>
          <ol className="briefpage-steps">
            <li><strong>1. 알고 싶은 것 (선택)</strong>
              <label className="visually-hidden" htmlFor="brief-question">이 모음으로 알고 싶은 것</label>
              <input id="brief-question" type="text" maxLength={120} value={question} placeholder="예: 자료마다 권장하는 방법이 어떻게 다른가?" onChange={e => setQuestion(e.target.value)} />
              <span className="briefpage-help">질문을 적으면 관련된 주장만 골라 근거 번호와 함께 답합니다. 비워 두면 전체를 비교합니다.</span>
              <span className="briefpage-examples">{questionExamples.map(q => <button key={q} type="button" className="button-quiet" onClick={() => setQuestion(q)}>{q}</button>)}</span>
            </li>
            <li><strong>2. 비교할 자료 고르기 (2~5개 권장)</strong></li>
          </ol>
          {docs.isPending && <><p role="status">자료를 불러오는 중…</p><Skeleton lines={4} /></>}
          {docs.isError && (
            <div className="briefpage-alert" role="alert">
              <span>자료 조회 실패: {docs.error.message}</span>
              <button type="button" className="button-secondary" onClick={() => void docs.refetch()}>다시 시도</button>
            </div>
          )}
          {status.isError && (
            <div className="briefpage-alert" role="alert">
              <span>분석 상태를 불러오지 못했습니다.</span>
              <button type="button" className="button-secondary" onClick={() => void status.refetch()}>상태 다시 확인</button>
            </div>
          )}
          {!docs.isPending && !docs.data?.items.length && <p className="briefpage-help">표시할 자료가 없습니다. <Link className="text-link" to="/documents">수집 자료 둘러보기 →</Link></p>}
          {noneReady && <p className="notice">아직 분석을 완료한 자료가 없습니다. 아래의 ‘상세에서 분석하기’를 누른 뒤 AI 요약을 먼저 완료하세요.</p>}
          {!!docs.data?.items.length && (
            <fieldset className="briefpage-list">
              <legend className="visually-hidden">최근 수집 자료 중 선택 ({ids.length}/5)</legend>
              {docs.data.items.map(d => {
                const state = status.data?.[d.documentId];
                const order = ids.indexOf(d.documentId);
                return (
                  <div className={`briefpage-row${order >= 0 ? ' briefpage-row-on' : ''}`} key={d.documentId}>
                    <label>
                      <input type="checkbox" disabled={state !== 'READY' || (order < 0 && ids.length >= 5)} checked={order >= 0}
                        onChange={e => setIds(e.target.checked ? [...ids, d.documentId] : ids.filter(x => x !== d.documentId))} />
                      {order >= 0 && <span className="bv-chip" aria-hidden="true">{order + 1}</span>}
                      <span>{d.title}</span>
                    </label>
                    <span className="briefpage-row-meta">
                      <Tag tone={state ? tones[state] : 'gray'}>{state ? labels[state] : '분석 상태 확인 중'}</Tag>
                      {d.contentText ? <Tag tone="green">본문 확보</Tag> : <Tag>발췌만</Tag>}
                    </span>
                    <Link className="text-link" to={`/documents/${d.documentId}?returnTo=%2Fbrief`}>{state === 'READY' ? '분석·출처 확인 →' : '상세에서 분석하기 →'}</Link>
                  </div>
                );
              })}
            </fieldset>
          )}
          <div className="briefpage-actions">
            <button type="button" disabled={!ready || create.isPending} onClick={() => create.mutate()}>{create.isPending ? '요약 모으는 중…' : ids.length === 1 ? '자료 1건 요약 보기' : `선택한 자료 ${ids.length || ''}건 비교 정리`}</button>
            <span className="briefpage-help">{ids.length}/5 선택 · 분석 완료 자료만 선택할 수 있습니다. 본문을 확보한 자료일수록 정리가 정확합니다.</span>
          </div>
          {create.isError && <p className="briefpage-alert" role="alert">{create.error.message}</p>}
        </div>
      </Card>
    </section>
  );
}
