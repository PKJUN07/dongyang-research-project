import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { request, sourceLabel } from '../../api/client';
import type { HistoryPage, StatsOverview } from '../../api/queries';
import { aiHealthReason, fetchAllHistory, useAiHealth, useConfig, useTopics } from '../../api/queries';
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState';
import { PageHeader } from '../../components/PageHeader';
import { Card, ChipTabs, Notice, ProgressBar, Skeleton, StatTile, Tag } from '../../components/ui';
import { formatKstDateTime, kstDate, sourceTone } from '../../lib/format';
import { StatsFlowChart } from './StatsFlowChart';
import { StatsHistory } from './StatsHistory';
import type { AllHistory, FlowSeries } from './statsData';
import { buildFlow, isRunning, lastSuccessAt, seriesLabel, seriesUnit, sumHistory } from './statsData';
import './stats.css';

const readingLabel: Record<string, string> = { UNREAD: '읽지 않음', READING: '읽는 중', READ: '읽음' };
const MAX_HISTORY_PAGES = 20;

/** 필터 펼침·차트 계열 선택은 URL이 바뀌어도(페이지 이동 등) 유지하려고 바깥에 둔다. */
export default function StatsPage() {
  const [params] = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const [series, setSeries] = useState<FlowSeries>('created');
  return <StatsContent key={params.toString()} filterOpen={filterOpen} setFilterOpen={setFilterOpen} series={series} setSeries={setSeries} />;
}

function StatsContent({ filterOpen, setFilterOpen, series, setSeries }: {
  filterOpen: boolean; setFilterOpen: (open: boolean) => void; series: FlowSeries; setSeries: (series: FlowSeries) => void;
}) {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') || kstDate(-29), to = params.get('to') || kstDate(), topicId = params.get('topicId') || '';
  const [draftFrom, setFrom] = useState(from), [draftTo, setTo] = useState(to), [draftTopic, setTopic] = useState(topicId);
  const [validation, setValidation] = useState('');
  const scope = new URLSearchParams({ from, to }); if (topicId) scope.set('topicId', topicId);
  const query = scope.toString();
  const page = Math.max(0, Number(params.get('page')) || 0);

  const allHistory = useQuery({
    queryKey: ['stats', 'history', 'all', query],
    queryFn: ({ signal }) => fetchAllHistory(new URLSearchParams(query), MAX_HISTORY_PAGES, signal),
    retry: false,
    refetchInterval: q => isRunning(q.state.data?.items) ? 5000 : false,
  });
  const running = isRunning(allHistory.data?.items);
  const overview = useQuery({ queryKey: ['stats', query], queryFn: ({ signal }) => request<StatsOverview>('/stats?' + query, undefined, signal), retry: false, refetchInterval: running ? 5000 : false });
  const history = useQuery({ queryKey: ['stats', 'history', query, page], queryFn: ({ signal }) => request<HistoryPage>('/stats/history?' + query + '&page=' + page, undefined, signal), retry: false, refetchInterval: q => isRunning(q.state.data?.items) ? 2000 : false });
  const topics = useTopics();
  const config = useConfig();
  const health = useAiHealth();

  const topic = topics.data?.find(t => String(t.id) === topicId);
  const topicName = topicId ? topic?.name ?? `주제 #${topicId}` : '전체 주제';
  const data = overview.data;

  function documents(extra: Record<string, string> = {}, library = false) { const q = new URLSearchParams({ from, to, dateBasis: 'FIRST_SAVED', includeSynthetic: 'true', ...extra }); if (topicId) q.set('topicId', topicId); return (library ? '/library?' : '/documents?') + q; }
  function apply(event: React.FormEvent) {
    event.preventDefault();
    const days = (Date.parse(draftTo) - Date.parse(draftFrom)) / 86400000;
    if (!draftFrom || !draftTo || !Number.isFinite(days) || days < 0 || days > 365) { setValidation('시작일부터 종료일까지 최대 366일로 선택하세요.'); return; }
    const q = new URLSearchParams({ from: draftFrom, to: draftTo }); if (draftTopic) q.set('topicId', draftTopic); setParams(q); setValidation('');
  }
  function goPage(next: number) { const q = new URLSearchParams(params); q.set('page', String(next)); setParams(q); }
  function retryAll() { void overview.refetch(); void allHistory.refetch(); void history.refetch(); }

  const refetchFailed = (overview.isError && overview.data) || (allHistory.isError && allHistory.data) || (history.isError && history.data);
  const fetching = overview.isFetching || allHistory.isFetching;
  const historyCard = <StatsHistory history={history} page={page} onPage={goPage} />;

  return <section className="page-shell stats-page">
    <PageHeader
      title={`${topicName} · 주제 분석`}
      description="검색·수집·중복·읽기 데이터를 같은 기간 기준으로 비교합니다."
      actions={<button type="button" className="button-secondary" aria-expanded={filterOpen} aria-controls="stats-filter" onClick={() => setFilterOpen(!filterOpen)}>필터 및 정렬</button>}
    />
    <form id="stats-filter" className="card stats-filter" onSubmit={apply} hidden={!filterOpen} aria-label="주제·기간 조건">
      <label>관심 주제<select value={draftTopic} onChange={e => setTopic(e.target.value)}><option value="">전체 주제</option>{topics.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>시작일<input required type="date" value={draftFrom} onChange={e => setFrom(e.target.value)} /></label>
      <label>종료일<input required type="date" value={draftTo} onChange={e => setTo(e.target.value)} /></label>
      <button type="submit">조회하기</button>
      <div className="stats-presets"><span>기간 빠른 선택</span>{[7, 30, 90].map(n => <button key={n} type="button" className="button-secondary" onClick={() => { setFrom(kstDate(1 - n)); setTo(kstDate()); }}>최근 {n}일</button>)}<span>선택 후 조회하기를 눌러주세요.</span></div>
      {validation && <p role="alert" className="stats-alert">{validation}</p>}
      {topics.isError && <p role="alert" className="stats-alert">주제 목록을 불러오지 못했습니다. <button type="button" className="button-secondary" onClick={() => void topics.refetch()}>주제 다시 불러오기</button></p>}
    </form>
    <div className="stats-scope-row">
      <p className="stats-scope" role="status">적용 조건: <strong>{topicName}</strong> · {from} ~ {to} · 한국 시간 (KST){fetching ? ' · 갱신 중…' : ''}</p>
      <nav className="stats-shortcuts" aria-label="주제 분석 바로가기"><a href="#stats-flow">자료 흐름 ↓</a><a href="#search-history">검색 이력 ↓</a></nav>
    </div>
    {refetchFailed && <div role="alert" className="stats-banner"><Notice title="최신 통계로 갱신하지 못했습니다">
      <p>이전에 불러온 수치를 그대로 보여줍니다. 연결을 확인한 뒤 다시 시도하세요.</p>
      <button type="button" className="button-secondary" onClick={retryAll}>다시 시도</button>
    </Notice></div>}

    {(data || allHistory.data || overview.isPending || allHistory.isPending) && <Kpis overview={data} overviewPending={overview.isPending} allHistory={allHistory} readLink={documents({ readingStatus: 'READ' })} />}
    {data && <details className="stats-details stats-population">
      <summary>집계 기준 · 합성 테스트 자료 {data.synthetic}건 포함 (실제 수집 {data.total - data.synthetic}건)</summary>
      <p>검색 횟수·원시 수집·검색별 신규 고유·중복 군집은 <strong>검색 시작 시각</strong> 기준입니다. 읽음 비율·처음 저장한 자료·읽기 진행·자료 유형은 <strong>처음 저장일</strong> 기준의 현재 상태라 두 숫자가 다를 수 있습니다.{allHistory.data && allHistory.data.items.length > 0 ? ` 검색 이력 중 합성 테스트 검색은 ${sumHistory(allHistory.data.items).synthetic}회입니다.` : ''}</p>
    </details>}

    {overview.isPending && <div className="stats-loading"><LoadingState title="주제 분석 데이터를 계산하고 있습니다" /><Skeleton lines={4} /></div>}
    {overview.isError && !data && <><ErrorState title="주제 분석 데이터를 불러오지 못했습니다" description={overview.error.message} onRetry={retryAll} />{historyCard}</>}
    {data && <div className="stats-layout">
      <div className="stats-area-flow">
        <FlowCard from={from} to={to} overview={data} allHistory={allHistory} series={series} setSeries={setSeries} dayLink={date => documents({ from: date, to: date })} />
      </div>
      <aside className="stack stats-area-aside" aria-label="읽기·자료 유형·출처 상태">
        <Card title="읽기 진행" aside={`${data.readPercent}%`}>
          <ProgressBar value={data.read} max={data.total} label={`처음 저장한 자료 ${data.total}건 중 ${data.read}건 읽음`} />
          {data.total === 0 && <p className="stats-help">이 기간에 처음 저장한 자료가 없습니다. 기간을 넓혀 조회하거나 전체 수집 자료에서 기존 자료를 확인하세요.</p>}
          <div className="grid-2 stats-mini-tiles">
            <StatTile label="나중에 읽기" value={`${data.readLater}건`} to={documents({ readLater: 'true' })} hint="목록 보기 →" />
            <StatTile label="즐겨찾기" value={`${data.favorite}건`} to={documents({ favorite: 'true' })} hint="목록 보기 →" />
          </div>
          <ul className="stats-link-list" aria-label="현재 읽기 상태별 자료">
            {data.readingCounts.map(r => <li key={r.status}><Link to={documents({ readingStatus: r.status })}><span>{readingLabel[r.status] ?? r.status}</span><strong>{r.count}건 →</strong></Link></li>)}
            <li><Link to={documents({}, true)}><span>보관함에 담음</span><strong>{data.saved}건 →</strong></Link></li>
            <li><Link to={documents()}><span>처음 저장한 자료 전체</span><strong>{data.total}건 →</strong></Link></li>
          </ul>
        </Card>
        <Card title="자료 유형" aside="처음 저장한 자료 기준">
          <ul className="stats-source-list">
            {data.sources.map(s => {
              const percent = data.total > 0 ? Math.round((s.count / data.total) * 100) : 0;
              return <li key={s.type}><Link to={documents({ sourceType: s.type })}>
                <span className={`stats-dot stats-dot-${sourceTone[s.type] ?? 'gray'}`} aria-hidden="true" />
                <span className="stats-source-name">{sourceLabel[s.type] ?? s.type}</span>
                <strong>{percent}%</strong>
                <span className="stats-source-count">{s.count}건 →</span>
              </Link></li>;
            })}
          </ul>
        </Card>
        <SourceStatus config={config} health={health} lastSuccess={allHistory.data ? lastSuccessAt(allHistory.data.items) : undefined} historyState={allHistory.isPending ? 'pending' : allHistory.data ? 'ready' : 'error'} truncated={Boolean(allHistory.data?.truncated)} />
      </aside>
      <div className="stats-area-history">{historyCard}</div>
    </div>}
  </section>;
}

function Kpis({ overview, overviewPending, allHistory, readLink }: {
  overview: StatsOverview | undefined; overviewPending: boolean;
  allHistory: UseQueryResult<AllHistory>; readLink: string;
}) {
  const h = allHistory.data;
  const sums = h ? sumHistory(h.items) : undefined;
  const pendingValue = allHistory.isPending ? '집계 중' : '-';
  const failHint = allHistory.isError && !h ? '검색 이력을 불러오지 못함' : undefined;
  const truncatedHint = h?.truncated ? `최근 ${h.items.length}회만 합산 (전체 ${h.total}회)` : undefined;
  const allRawMissing = sums !== undefined && h !== undefined && h.items.length > 0 && sums.rawMissing === h.items.length;
  return (
    <div className="kpi-row stats-kpis" aria-label="선택 기간 핵심 지표">
      <StatTile label="기간 내 검색 횟수" value={h ? `${h.total}회` : pendingValue} hint={failHint ?? (h?.truncated ? `이 중 ${h.items.length}회 이력만 아래 지표에 합산` : '검색 시작 시각 기준')} />
      <StatTile label="기간 내 원시 수집" value={sums ? (allRawMissing ? '미기록' : `${sums.raw}건`) : pendingValue}
        hint={failHint ?? (sums && sums.rawMissing > 0 ? `일부 미기록 (${sums.rawMissing}회 제외)` : truncatedHint ?? '제공자 응답 결과 합계')} />
      <StatTile label="검색별 신규 고유" tone="green" value={sums ? `${sums.created}건` : pendingValue} hint={failHint ?? truncatedHint ?? '검색 시작 시각 기준'} />
      <StatTile label="검색별 중복 군집" tone="orange" value={sums ? `${sums.duplicates}건` : pendingValue} hint={failHint ?? truncatedHint ?? '유효 결과 − 고유 자료'} />
      <StatTile label="기간 내 읽음 비율" tone="purple" value={overview ? `${overview.readPercent}%` : overviewPending ? '집계 중' : '-'}
        to={overview ? readLink : undefined} hint={overview ? `처음 저장한 자료 ${overview.total}건 중 ${overview.read}건 →` : undefined} />
    </div>
  );
}

function FlowCard({ from, to, overview, allHistory, series, setSeries, dayLink }: {
  from: string; to: string; overview: StatsOverview;
  allHistory: UseQueryResult<AllHistory>;
  series: FlowSeries; setSeries: (series: FlowSeries) => void; dayLink: (date: string) => string;
}) {
  const h = allHistory.data;
  const rows = buildFlow(from, to, overview, h?.items);
  const historySeries = series !== 'created';
  const total = (key: FlowSeries) => rows.reduce((sum, row) => sum + row[key], 0);
  const historyCount = (key: FlowSeries) => h ? total(key) : undefined;
  const nothing = overview.total === 0 && h !== undefined && h.total === 0;
  return (
    <Card className="stats-flow" title={<span id="stats-flow">자료 흐름</span>} aside={`${from} ~ ${to} · 일별`}>
      <ChipTabs<FlowSeries> ariaLabel="차트에 표시할 지표" value={series} onChange={setSeries} items={[
        { value: 'searches', label: seriesLabel.searches, count: historyCount('searches') },
        { value: 'created', label: seriesLabel.created, count: total('created') },
        { value: 'duplicates', label: seriesLabel.duplicates, count: historyCount('duplicates') },
      ]} />
      <p className="stats-help">{series === 'created'
        ? '처음 저장한 날짜(KST) 기준 자료 수입니다. 단위: 건'
        : series === 'searches' ? '검색 작업을 시작한 날짜(KST) 기준 횟수입니다. 단위: 회' : '검색 작업을 시작한 날짜(KST) 기준 확정 중복 수입니다. 단위: 건'}
        {historySeries && h?.truncated ? ` 이력이 많아 최근 ${h.items.length}회만 반영했습니다.` : ''}</p>
      {nothing ? <EmptyState title="이 기간에 검색·저장 기록이 없습니다" description="필터 및 정렬에서 기간을 넓히거나 다른 주제를 선택해 보세요. 0건인 날짜만 있어 차트를 그리지 않았습니다." />
        : historySeries && allHistory.isPending ? <LoadingState title="검색 이력을 집계하고 있습니다" />
        : historySeries && !h ? <ErrorState title="검색 이력을 불러오지 못해 이 지표를 그릴 수 없습니다" description={allHistory.error?.message} onRetry={() => void allHistory.refetch()} />
        : <>
          {total(series) === 0 && <p className="stats-help" role="status">이 기간의 {seriesLabel[series]}는 모두 0{seriesUnit[series]}입니다.</p>}
          <StatsFlowChart rows={rows} series={series} />
        </>}
      <details className="stats-details">
        <summary>날짜별 수치를 표로 보기</summary>
        <div className="stats-table-scroll">
          <table>
            <caption>차트와 동일한 날짜별 수치 (KST){h?.truncated ? ` · 검색 횟수·중복 자료는 최근 ${h.items.length}회 이력 기준` : ''}</caption>
            <thead><tr><th scope="col">날짜</th><th scope="col">검색 횟수</th><th scope="col">처음 저장한 자료</th><th scope="col">중복 자료</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.date}>
              <th scope="row">{row.date}</th>
              <td>{h ? `${row.searches}회` : '-'}</td>
              <td><Link to={dayLink(row.date)}>{row.created}건 보기</Link></td>
              <td>{h ? `${row.duplicates}건` : '-'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function SourceStatus({ config, health, lastSuccess, historyState, truncated }: {
  config: ReturnType<typeof useConfig>; health: ReturnType<typeof useAiHealth>;
  lastSuccess: string | undefined; historyState: 'pending' | 'ready' | 'error'; truncated: boolean;
}) {
  const c = config.data;
  const providerName = c ? (c.synthetic ? '합성 테스트' : c.provider === 'SERPER' ? 'Serper' : c.provider) : '검색 제공자';
  const providerTag = c ? (c.synthetic ? <Tag tone="purple">테스트 모드</Tag> : c.externalSearchReady ? <Tag tone="green">요청 가능</Tag> : <Tag tone="orange">사용 불가</Tag>) : null;
  const lastText = historyState === 'pending' ? '확인 중' : historyState === 'error' ? '이력을 불러오지 못함' : lastSuccess ? `${formatKstDateTime(lastSuccess)} (KST)` : '이 조건에서 성공한 검색 없음';
  return (
    <Card title="출처 상태">
      <ul className="stats-status-list">
        <li>
          <span className="stats-status-icon" aria-hidden="true">검색</span>
          <div className="stats-status-text">
            <strong>{providerName}</strong>
            {config.isPending && <span>검색 설정 확인 중…</span>}
            {config.isError && !c && <span>검색 설정을 불러오지 못했습니다. <button type="button" className="button-quiet stats-inline-button" onClick={() => void config.refetch()}>다시 확인</button></span>}
            {c && <>
              <span>{searchReasonText[c.searchReason] ?? c.searchReason}</span>
              <span>남은 예산 {c.remaining} / {c.maximum}회 (누적 사용 {c.attempts}회)</span>
            </>}
            <span>마지막 성공 검색: {lastText}{truncated && lastSuccess ? ' · 최근 이력 기준' : ''}</span>
          </div>
          {providerTag}
        </li>
        <li>
          <span className="stats-status-icon" aria-hidden="true">AI</span>
          <div className="stats-status-text">
            <strong>로컬 AI (Ollama)</strong>
            <span>{health.isPending ? '연결 확인 중…' : health.data ? `${health.data.model || '모델 미확인'} · ${health.data.available ? '로컬 처리' : aiHealthReason(health.data.code)}` : '연결 상태를 확인할 수 없습니다'}</span>
          </div>
          {health.data?.available ? <Tag tone="green">정상</Tag> : health.isPending ? <Tag tone="gray">확인 중</Tag> : <Tag tone="orange">사용 불가</Tag>}
        </li>
      </ul>
    </Card>
  );
}

const searchReasonText: Record<string, string> = {
  READY: 'Serper 실제 검색 요청이 가능합니다.',
  TEST_MODE: '실제 웹 검색이 연결되지 않아 합성 자료로 기능을 시험합니다.',
  PROVIDER_KEY_MISSING: '서버에 Serper API 키가 설정되지 않았습니다.',
  APPROVAL_REQUIRED: '외부 검색 호출 승인이 설정되지 않았습니다.',
  BUDGET_EXHAUSTED: '승인된 누적 검색 횟수를 모두 사용했습니다.',
  PROVIDER_COOLDOWN: '검색 제공자의 요청 제한 대기 중입니다.',
};
