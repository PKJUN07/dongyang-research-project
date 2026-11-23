import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { request, sourceLabel } from '../../api/client';
import type { Topic } from '../../api/client';
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState';
import { PageHeader } from '../../components/PageHeader';
import './stats.css';

type Overview = { readingCounts: { status: string; count: number }[]; from: string; to: string; total: number; read: number; saved: number; favorite: number; readLater: number; synthetic: number; readPercent: number; daily: { date: string; count: number }[]; sources: { type: keyof typeof sourceLabel; count: number }[] };
type History = { id: number; topic: string; provider: string; synthetic: boolean; status: string; startedAt: string; finishedAt: string | null; errorCode: string | null; raw: number | null; excluded: number | null; valid: number; unique: number; created: number; existing: number; duplicates: number; bodyFailures: number };
type HistoryPage = { items: History[]; total: number; page: number; size: number };
const status: Record<string, string> = { QUEUED: '대기 중', RUNNING: '처리 중', SUCCEEDED: '완료', PARTIAL: '일부 본문 확인 불가', FAILED: '실패' };
const dateText = (date: string | null) => date ? new Date(date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '아직 완료되지 않음';
function day(offset = 0) { return new Date(Date.now() + 9 * 3600000 + offset * 86400000).toISOString().slice(0, 10); }
export default function StatsPage() {
  const [params] = useSearchParams();
  return <StatsContent key={params.toString()} />;
}
function StatsContent() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') || day(-29), to = params.get('to') || day(), topicId = params.get('topicId') || '';
  const [draftFrom, setFrom] = useState(from), [draftTo, setTo] = useState(to), [draftTopic, setTopic] = useState(topicId);
  const [validation, setValidation] = useState('');
  const scope = new URLSearchParams({ from, to }); if (topicId) scope.set('topicId', topicId);
  const query = scope.toString();
  const page = Math.max(0, Number(params.get('page')) || 0);
  const overview = useQuery({ queryKey: ['stats', query], queryFn: ({ signal }) => request<Overview>('/stats?' + query, undefined, signal), retry: false });
  const history = useQuery({ queryKey: ['stats', 'history', query, page], queryFn: ({ signal }) => request<HistoryPage>('/stats/history?' + query + '&page=' + page, undefined, signal), retry: false, refetchInterval: q => q.state.data?.items.some(x => ['RUNNING', 'QUEUED'].includes(x.status)) ? 2000 : false });
  const topics = useQuery({ queryKey: ['topics'], queryFn: ({ signal }) => request<Topic[]>('/topics', undefined, signal) });
  const data = overview.data;
  function documents(extra: Record<string, string> = {}, library = false) { const q = new URLSearchParams({ from, to, dateBasis: 'FIRST_SAVED', includeSynthetic: 'true', ...extra }); if (topicId) q.set('topicId', topicId); return (library ? '/library?' : '/documents?') + q; }
  function apply(event: React.FormEvent) {
    event.preventDefault();
    const days = (Date.parse(draftTo) - Date.parse(draftFrom)) / 86400000;
    if (!draftFrom || !draftTo || !Number.isFinite(days) || days < 0 || days > 365) { setValidation('시작일부터 종료일까지 최대 366일로 선택하세요.'); return; }
    const q = new URLSearchParams({ from: draftFrom, to: draftTo }); if (draftTopic) q.set('topicId', draftTopic); setParams(q); setValidation('');
  }
  return <section className="page-shell stats-page">
    <PageHeader eyebrow="MY RESEARCH" title="통계·검색 이력" description="어떤 자료를 모았고 얼마나 읽었는지 확인하세요. 숫자를 누르면 해당 자료로 이동합니다." />
    <nav className="stats-shortcuts" aria-label="통계 화면 바로가기"><a href="#stats-summary">자료 통계 ↓</a><a href="#search-history">검색 작업 이력 ↓</a></nav>
    <form className="stats-filter" onSubmit={apply}>
      <label>관심 주제<select value={draftTopic} onChange={e => setTopic(e.target.value)}><option value="">전체 주제</option>{topics.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>시작일<input required type="date" value={draftFrom} onChange={e => setFrom(e.target.value)} /></label>
      <label>종료일<input required type="date" value={draftTo} onChange={e => setTo(e.target.value)} /></label>
      <button type="submit">조회하기</button>
      <div className="stats-presets"><span>기간 빠른 선택</span>{[7, 30, 90].map(n => <button key={n} type="button" className="button-secondary" onClick={() => { setFrom(day(1 - n)); setTo(day()); }}>최근 {n}일</button>)}<span>선택 후 조회하기를 눌러주세요.</span></div>
      {validation && <p role="alert">{validation}</p>}
      {topics.isError && <p role="alert">주제 목록을 불러오지 못했습니다. <button type="button" onClick={() => void topics.refetch()}>주제 다시 불러오기</button></p>}
    </form>
    <p className="stats-scope" role="status">적용 기간: {from} ~ {to} · 한국 시간 (KST){overview.isFetching ? ' · 갱신 중…' : ''}</p>
    {overview.isPending && <LoadingState title="자료 통계를 계산하고 있습니다" />}
    {overview.isError && <ErrorState title="통계를 불러오지 못했습니다" description={overview.error.message} onRetry={() => void overview.refetch()} />}
    {data && <>
      <h2 id="stats-summary">이 기간에 처음 저장한 자료</h2>
      <p className="stats-help">발행일과 다릅니다. 다시 검색한 자료는 신규로 세지 않습니다. 읽음·보관은 이 자료들의 현재 상태입니다.</p>
      <div className="stats-kpis">
        <Link to={documents()}><span>신규 자료</span><strong>{data.total}<small>건</small></strong><span>자료 전체 보기 →</span></Link>
        <Link to={documents({ readingStatus: 'READ' })}><span>현재 읽음</span><strong>{data.read}<small> / {data.total}건</small></strong><span>읽음 비율 {data.readPercent}% →</span></Link>
        <Link to={documents({}, true)}><span>보관함에 담음</span><strong>{data.saved}<small>건</small></strong><span>보관한 자료 보기 →</span></Link>
        <Link to={documents({ readLater: 'true' })}><span>나중에 읽기</span><strong>{data.readLater}<small>건</small></strong><span>다음에 읽을 자료 →</span></Link>
      </div>
      <p className="stats-help">이 집계에는 합성 테스트 자료 {data.synthetic}건이 포함됩니다. 실제 수집 자료는 {data.total - data.synthetic}건입니다.</p>
      <section className="stats-reading" aria-label="현재 읽기 상태별 자료"><h3>다음에 읽을 자료를 찾아보세요</h3>{data.readingCounts.map(r => <Link key={r.status} to={documents({ readingStatus: r.status })}>{({ UNREAD: '읽지 않음', READING: '읽는 중', READ: '읽음' } as Record<string, string>)[r.status]} <strong>{r.count}건 →</strong></Link>)}</section>
      {data.total === 0 ? <EmptyState title="이 기간에 처음 저장한 자료가 없습니다" description="기간을 넓혀 조회하거나 저장 자료 메뉴에서 기존 자료를 확인하세요. 검색 이력은 아래에서 별도로 확인할 수 있습니다." /> : <div className="stats-charts">
        <section className="stats-panel"><h2>날짜별 신규 자료</h2><p className="stats-help">처음 저장한 날짜 · KST · 단위: 건</p>
          <div className="stats-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.daily} accessibilityLayer><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={d => d.slice(5)} minTickGap={25} /><YAxis allowDecimals={false} width={35} /><Tooltip /><Bar dataKey="count" name="신규 자료 (건)" fill="#6550cd" maxBarSize={48} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
          <details><summary>날짜별 수치를 표로 보기</summary><div className="stats-table-scroll"><table><caption>그래프와 동일한 신규 자료 수</caption><thead><tr><th scope="col">저장 날짜</th><th scope="col">자료 수</th></tr></thead><tbody>{data.daily.map(d => <tr key={d.date}><td>{d.date}</td><td><Link to={documents({ from: d.date, to: d.date })}>{d.count}건 보기</Link></td></tr>)}</tbody></table></div></details>
        </section>
        <section className="stats-panel"><h2>출처별 자료</h2><p className="stats-help">기타 출처도 빠짐없이 포함합니다.</p>{data.sources.map(s => <Link className="source-stat" to={documents({ sourceType: s.type })} key={s.type}><span>{sourceLabel[s.type]}</span><strong>{s.count}건 →</strong><progress aria-label={sourceLabel[s.type] + ' 자료 비중'} value={s.count} max={data.total || 1} /></Link>)}<Link to={documents({ favorite: 'true' })}>즐겨찾기 {data.favorite}건 보기 →</Link></section>
      </div>}
    </>}
    <section className="stats-history" id="search-history"><h2>검색 작업 이력</h2><p className="stats-help">위 기간에 시작한 검색입니다. 재검색도 별도 작업으로 표시하며, 결과는 검색 당시의 자료 연결을 보여줍니다.</p>
      {history.isPending && <LoadingState title="검색 이력 불러오는 중" />}
      {history.isError && <ErrorState title="검색 이력을 불러오지 못했습니다" description={history.error.message} onRetry={() => void history.refetch()} />}
      {history.data && <><p>검색 {history.data.total}회</p>{!history.data.items.length && <EmptyState title="이 기간에 시작한 검색이 없습니다" description="기간이나 주제 조건을 변경해 보세요." />}
        {history.data.items.map(run => <article className="stats-run" key={run.id}>
          <div className="run-heading"><h3>{run.topic} · 검색 #{run.id}</h3><span className={'run-status ' + (run.status === 'FAILED' ? 'run-failed' : '')}>{status[run.status] || run.status}</span><span>{run.synthetic ? '합성 테스트' : '실제 검색'} · {run.provider}</span></div>
          <p>시작 {dateText(run.startedAt)}<br />완료 {dateText(run.finishedAt)}</p>
          <div className="run-counts"><span>중복 정리 후 <strong>{run.unique}건</strong></span><span>신규 <strong>{run.created}건</strong></span><span>기존 자료 <strong>{run.existing}건</strong></span></div>
          {run.status === 'PARTIAL' && <p>검색 결과는 저장했습니다. 일부 자료의 본문은 확인할 수 없어 검색 요약과 원문 링크를 제공합니다.</p>}
          {run.status === 'FAILED' && <p role="status">검색이 완료되지 않았습니다. 기존에 보관한 자료와 메모는 그대로 이용할 수 있습니다. 오류 코드: {run.errorCode ?? '미기록'}</p>}
          <details><summary>집계 상세 보기</summary><p>원시 수신 {run.raw ?? '미기록'} · 제외 {run.excluded ?? '미기록'} · 저장 처리한 유효 결과 {run.valid} · 확정 중복 {run.duplicates} · 본문 확인 불가 {run.bodyFailures}</p><p>유효 결과 = 고유 자료 + 확정 중복입니다. 제외에는 무효 URL·개수 상한 초과가 포함됩니다. 이전 버전의 원시 수신·제외 수는 미기록으로 표시합니다. 처리 실패 시 받은 결과가 모두 저장되지 않았을 수 있습니다.</p></details>
          {run.unique > 0 && <Link className="button-secondary" to={'/documents?runId=' + run.id}>이 검색의 자료 {run.unique}건 보기 →</Link>}
        </article>)}
        {history.data.total > 10 && <nav className="stats-pagination" aria-label="검색 이력 페이지"><button disabled={page === 0} onClick={() => { const q = new URLSearchParams(params); q.set('page', String(page - 1)); setParams(q); }}>이전</button><span>{page + 1} / {Math.ceil(history.data.total / 10)}페이지</span><button disabled={(page + 1) * 10 >= history.data.total} onClick={() => { const q = new URLSearchParams(params); q.set('page', String(page + 1)); setParams(q); }}>다음</button></nav>}
      </>}
    </section>
  </section>;
}

