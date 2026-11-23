import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { request, sourceLabel } from '../../api/client';
import type { ResultPage } from '../../api/client';
import type { Brief, BriefEntry, Readiness } from '../../api/queries';
import { parseAiResult } from '../../api/queries';
import { PageHeader } from '../../components/PageHeader';
import { Card, Skeleton, Tag } from '../../components/ui';
import type { TagTone } from '../../components/ui';
import { formatKstDateTime, sourceTone } from '../../lib/format';
import { rememberBrief } from '../../lib/storage';
import '../feed/brief.css';

const labels: Record<Readiness, string> = { READY: '분석 완료', RUNNING: '분석 중', STALE: '재분석 필요', NOT_ANALYZED: '미분석', FAILED: '분석 재시도 필요' };
const tones: Record<Readiness, TagTone> = { READY: 'green', RUNNING: 'blue', STALE: 'orange', NOT_ANALYZED: 'gray', FAILED: 'red' };

export default function BriefPage() {
  const [ids, setIds] = useState<number[]>([]);
  const [params, setParams] = useSearchParams();
  const includeSynthetic = params.get('includeSynthetic') === 'true';
  function setIncludeSynthetic(value: boolean) {
    const next = new URLSearchParams(params);
    if (value) next.set('includeSynthetic', 'true'); else next.delete('includeSynthetic');
    setParams(next, { replace: true });
  }
  const briefId = Number(params.get('briefId'));
  const docs = useQuery({ queryKey: ['saved-documents', 'brief', includeSynthetic], queryFn: () => request<ResultPage>('/documents?size=100&sort=FETCHED_DESC' + (includeSynthetic ? '' : '&synthetic=false')) });
  const visibleIds = docs.data?.items.map(d => d.documentId) ?? [];
  const status = useQuery({
    queryKey: ['ai', 'readiness', visibleIds.join(',')], enabled: visibleIds.length > 0,
    queryFn: ({ signal }) => request<Record<string, Readiness>>('/ai/readiness?ids=' + visibleIds.join(','), undefined, signal), retry: false,
    refetchInterval: q => Object.values(q.state.data ?? {}).includes('RUNNING') ? 2000 : false,
  });
  const ready = ids.length > 0 && ids.every(id => visibleIds.includes(id) && status.data?.[id] === 'READY');
  const snapshot = useQuery({
    queryKey: ['brief', briefId], enabled: Number.isSafeInteger(briefId) && briefId > 0, retry: false,
    queryFn: async ({ signal }) => {
      const brief = await request<Brief>('/ai/briefs/' + briefId, undefined, signal);
      rememberBrief(brief.briefId);
      return brief;
    },
  });
  const create = useMutation({
    mutationFn: () => request<{ briefId: number; documents: BriefEntry[] }>('/ai/briefs', ids),
    onSuccess: result => { rememberBrief(result.briefId); setParams(includeSynthetic ? { briefId: String(result.briefId), includeSynthetic: 'true' } : { briefId: String(result.briefId) }); },
    retry: false,
  });
  const noneReady = docs.data && visibleIds.length > 0 && status.data && !Object.values(status.data).includes('READY');

  return (
    <section className="page-shell briefpage">
      <PageHeader
        title="자료 요약 모음"
        description="최신 AI 분석을 완료한 자료를 최대 5개 선택하세요. 출처별 요약을 함께 보되 서로 다른 시점·제품·의견을 하나의 사실로 합치지 않습니다."
        actions={<Link className="button-link-secondary" to={includeSynthetic ? '/feed?includeSynthetic=true' : '/feed'}>리서치 피드로</Link>}
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
            <h2 className="card-title">저장된 요약 모음 #{snapshot.data.briefId}</h2>
            <div className="card-tags">
              <Tag tone="purple">AI 생성</Tag>
              <span className="briefpage-badge">자료 {snapshot.data.snapshot.length}건{snapshot.data.createdAt ? ` · 생성 ${formatKstDateTime(snapshot.data.createdAt)}` : ''}</span>
            </div>
          </div>
          <p className="briefpage-help">생성 시점의 분석·근거 스냅샷입니다. 출처마다 따로 요약했으며 원문이 바뀌었다면 상세 화면에서 현재 자료와 비교하세요.</p>
          <div className="briefpage-entries">
            {snapshot.data.snapshot.map((d, index) => {
              const r = parseAiResult(d.analysis?.result_json);
              const detail = `/documents/${d.documentId}?returnTo=${encodeURIComponent('/brief?briefId=' + briefId)}`;
              return (
                <article className="briefpage-entry" key={d.documentId}>
                  <div className="card-tags">
                    <span className="briefpage-number">[{index + 1}]</span>
                    <Tag tone={sourceTone[d.sourceType] ?? 'gray'}>{sourceLabel[d.sourceType] ?? '기타'}</Tag>
                    <Tag>{d.analysis?.input_type === 'SNIPPET' ? '검색 요약 기반' : '본문 기반'}</Tag>
                  </div>
                  <h3><Link to={detail}>{d.title}</Link></h3>
                  {r ? (
                    <>
                      <p className="briefpage-summary"><span className="briefpage-ai">AI 요약</span> {r.summary}</p>
                      <ul className="briefpage-claims">
                        {r.claims.map((c, i) => (
                          <li key={i}>
                            <span>{c.text}</span>
                            {c.quote.trim() && <q>{c.quote}</q>}
                            <Link className="text-link" to={detail}>출처·근거 확인 →</Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : <p className="briefpage-help" role="alert">저장된 분석 결과를 읽을 수 없습니다. 상세 화면에서 다시 확인하세요.</p>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <Card title="자료 선택" aside={`최근 수집 자료 · ${ids.length}/5 선택`} className="briefpage-select">
        <label className="briefpage-check">
          <input type="checkbox" checked={includeSynthetic} onChange={e => { setIncludeSynthetic(e.target.checked); setIds([]); }} />
          테스트 자료 포함
        </label>
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
              return (
                <div className="briefpage-row" key={d.documentId}>
                  <label>
                    <input type="checkbox" disabled={state !== 'READY' || (!ids.includes(d.documentId) && ids.length >= 5)} checked={ids.includes(d.documentId)}
                      onChange={e => setIds(e.target.checked ? [...ids, d.documentId] : ids.filter(x => x !== d.documentId))} />
                    <span>{d.title}</span>
                  </label>
                  <Tag tone={state ? tones[state] : 'gray'}>{state ? labels[state] : '분석 상태 확인 중'}</Tag>
                  <Link className="text-link" to={`/documents/${d.documentId}?returnTo=%2Fbrief`}>{state === 'READY' ? '분석·출처 확인 →' : '상세에서 분석하기 →'}</Link>
                </div>
              );
            })}
          </fieldset>
        )}
        <div className="briefpage-actions">
          <button type="button" disabled={!ready || create.isPending} onClick={() => create.mutate()}>{create.isPending ? '요약 모으는 중…' : '선택한 자료 요약 모으기'}</button>
          <span className="briefpage-help">{ids.length}/5 선택 · 분석 완료 자료만 선택할 수 있습니다.</span>
        </div>
        {create.isError && <p className="briefpage-alert" role="alert">{create.error.message}</p>}
      </Card>
    </section>
  );
}
