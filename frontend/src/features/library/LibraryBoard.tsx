import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { request, sourceLabel } from '../../api/client';
import type { DocumentResult, ResultPage, Topic } from '../../api/client';
import { useDocumentCount, useTopics } from '../../api/queries';
import { EmptyState, ErrorState } from '../../components/AsyncState';
import { ChipTabs, Skeleton, Tag } from '../../components/ui';
import type { TagTone } from '../../components/ui';
import { kstDate, relativeDayLabel, topicColor } from '../../lib/format';
import { DocumentFilterBar } from '../documents/DocumentFilterBar';
import { Pagination } from '../documents/Pagination';
import { buildListFilters, hasListConditions, useListParams } from '../documents/documentFilters';
import { readingStatusLabel, useDocumentTopicIds, useReadingMutation } from './useReading';
import './library.css';

type Chip = 'all' | 'unread' | 'later' | 'favorite' | 'custom';
type CountQuery = { data?: number; isError: boolean };

const statusTone: Record<DocumentResult['readingStatus'], TagTone> = { UNREAD: 'gray', READING: 'blue', READ: 'green' };

/** 이번 주 월요일(KST) YYYY-MM-DD. */
function kstWeekStart() {
  const day = new Date(`${kstDate(0)}T00:00:00Z`).getUTCDay();
  return kstDate(-((day + 6) % 7));
}

/** 개수 표시: 받기 전 '…', 실패 '-'. */
function countText(query: CountQuery) {
  return query.isError ? '-' : query.data === undefined ? '…' : query.data.toLocaleString();
}

/** 읽기 보관함 본문: 주제 카드 · 상태 칩 · 정렬 · 보관 자료 목록. 목록 조건은 URL에 둔다. */
export function LibraryBoard({ manageOpen }: { manageOpen: boolean }) {
  const { params, change, changeMany, reset } = useListParams();
  const location = useLocation();
  const topics = useTopics();
  const [message, setMessage] = useState('');
  const topicParam = params.get('topicId') ?? '';
  const selectedTopic = Number(topicParam) > 0 ? topicParam : '';
  const scope: Record<string, string> = { saved: 'true', ...(selectedTopic ? { topicId: selectedTopic } : {}) };
  const total = useDocumentCount(scope);
  const unread = useDocumentCount({ ...scope, readingStatus: 'UNREAD' });
  const later = useDocumentCount({ ...scope, readLater: 'true' });
  const favorite = useDocumentCount({ ...scope, favorite: 'true' });

  const filterString = buildListFilters(params, { library: true }).toString();
  const list = useQuery({
    queryKey: ['saved-documents', 'all', filterString],
    queryFn: ({ signal }) => request<ResultPage>(`/documents?${filterString}`, undefined, signal),
    retry: false,
    placeholderData: keepPreviousData,
  });

  const readingStatus = params.get('readingStatus') ?? '';
  const statusActive = readingStatus !== '' && readingStatus !== 'ALL';
  const fav = params.get('favorite') === 'true';
  const rl = params.get('readLater') === 'true';
  const chip: Chip = !statusActive && !fav && !rl ? 'all'
    : readingStatus === 'UNREAD' && !fav && !rl ? 'unread'
    : !statusActive && rl && !fav ? 'later'
    : !statusActive && fav && !rl ? 'favorite' : 'custom';
  const sort = params.get('sort') ?? 'FETCHED_DESC';
  const weekFrom = kstWeekStart();
  const today = kstDate(0);
  const conditions = hasListConditions(params);
  const returnTo = location.pathname + location.search;
  const topicList = topics.data ?? [];

  function selectChip(value: Chip) {
    changeMany({ readingStatus: value === 'unread' ? 'UNREAD' : '', readLater: value === 'later' ? 'true' : '', favorite: value === 'favorite' ? 'true' : '' });
  }

  return <div className="lib-board">
    <div id="lib-manage" className="lib-manage" hidden={!manageOpen}>
      <DocumentFilterBar params={params} topics={topicList} onChange={change} onReset={reset} />
    </div>

    <section className="lib-topics" aria-label="주제별 보관함">
      {topics.isPending && <><p className="visually-hidden" role="status">주제 목록 조회 중</p>{[0, 1, 2].map(i => <div key={i} className="lib-topic-card lib-topic-skeleton"><Skeleton lines={3} /></div>)}</>}
      {topics.isError && <p className="lib-inline-alert" role="alert">주제 목록을 불러오지 못했습니다. 아래 목록은 계속 사용할 수 있습니다. <button className="button-secondary" onClick={() => { void topics.refetch(); }}>다시 조회</button></p>}
      {topics.data && !topics.data.length && <p className="lib-topics-empty">아직 관심 주제가 없습니다. <Link className="text-link" to="/search">검색 화면</Link>에서 주제를 만들면 주제별 보관함 카드가 생깁니다.</p>}
      {topicList.map(topic => <TopicCard key={topic.id} topic={topic} pressed={selectedTopic === String(topic.id)} weekFrom={weekFrom} today={today}
        onToggle={() => change('topicId', selectedTopic === String(topic.id) ? '' : String(topic.id))} />)}
    </section>

    <section className="card lib-list" aria-label="보관 자료 목록">
      <div className="lib-toolbar">
        <ChipTabs<Chip> ariaLabel="읽기 상태로 거르기" value={chip} onChange={selectChip} items={[
          { value: 'all', label: '전체', count: total.data },
          { value: 'unread', label: '읽지 않음', count: unread.data },
          { value: 'later', label: '나중에 읽기', count: later.data },
          { value: 'favorite', label: '즐겨찾기', count: favorite.data },
        ]} />
        <label className="lib-sort"><span>정렬</span><select value={sort} onChange={e => change('sort', e.target.value)}>
          <option value="FETCHED_DESC">최근 저장순</option><option value="PUBLISHED_DESC">발행일순</option><option value="TITLE_ASC">제목순</option>
          {sort === 'RANK' && <option value="RANK">검색 순위순</option>}
        </select></label>
      </div>
      <div className="lib-scope">
        {selectedTopic && <Tag tone="purple">주제: {topicList.find(t => String(t.id) === selectedTopic)?.name ?? `#${selectedTopic}`}</Tag>}
        {chip === 'custom' && <Tag tone="orange">상세 필터의 읽기 조건 적용 중</Tag>}
        {(total.isError || unread.isError || later.isError || favorite.isError) && <span className="lib-count-error">일부 개수를 불러오지 못했습니다.</span>}
        <span className="lib-scope-status" role="status">{list.isFetching && list.data ? '목록 갱신 중…' : list.data ? `조건에 맞는 자료 ${list.data.totalElements.toLocaleString()}건` : ''}</span>
      </div>
      {message && <p className="lib-message" role="status">{message}</p>}

      {list.isPending && <><p className="visually-hidden" role="status">보관 자료 조회 중</p><div className="lib-rows-skeleton">{[0, 1, 2].map(i => <Skeleton key={i} lines={3} />)}</div></>}
      {list.isError && !list.data && <ErrorState title="보관함 목록을 불러오지 못했습니다" description={list.error.message} onRetry={() => { void list.refetch(); }} />}
      {list.isError && list.data && <p className="lib-inline-alert" role="alert">목록을 새로 불러오지 못했습니다. 마지막으로 불러온 목록을 표시합니다. <button className="button-secondary" onClick={() => { void list.refetch(); }}>다시 시도</button></p>}
      {list.data && (list.data.items.length
        ? <ul className="lib-rows">{list.data.items.map(item => <LibraryRow key={item.documentId} item={item} topics={topicList} selectedTopic={selectedTopic} returnTo={returnTo}
            onUnsaved={title => setMessage(`‘${title}’ 보관을 해제했습니다. 원문·메모·즐겨찾기·읽기 상태는 유지됩니다.`)} />)}</ul>
        : <div className="lib-empty">
            <EmptyState title={list.data.totalElements ? '현재 페이지에 자료가 없습니다' : conditions ? '조건에 맞는 자료가 없습니다' : '아직 보관한 자료가 없습니다'}
              description={list.data.totalElements ? '첫 페이지로 이동해 보세요.' : conditions ? '주제·상태·필터 조건을 바꾸거나 초기화해 보세요.' : '검색으로 자료를 모은 뒤 자료 상세의 ‘내 보관함에 담기’를 누르면 여기에 모입니다.'} />
            <div className="lib-empty-links">
              {conditions && !list.data.totalElements && <button className="button-secondary" onClick={reset}>조건 초기화</button>}
              <Link className="button-link" to="/search">새 자료 검색하기</Link>
              <Link className="button-link-secondary" to="/documents">수집 자료 둘러보기 →</Link>
            </div>
          </div>)}
      {list.data && list.data.page >= list.data.totalPages && list.data.page > 0 && <p className="lib-first-page"><button className="button-secondary" onClick={() => change('page', '0')}>첫 페이지로 이동</button></p>}
      {list.data && list.data.totalPages > 0 && <Pagination page={list.data.page} totalPages={list.data.totalPages} pending={list.isFetching} onChange={p => change('page', String(p))} />}
    </section>
  </div>;
}

function TopicCard({ topic, pressed, weekFrom, today, onToggle }: { topic: Topic; pressed: boolean; weekFrom: string; today: string; onToggle: () => void }) {
  const base = { saved: 'true', topicId: String(topic.id) };
  const total = useDocumentCount(base);
  const unread = useDocumentCount({ ...base, readingStatus: 'UNREAD' });
  const favorite = useDocumentCount({ ...base, favorite: 'true' });
  const week = useDocumentCount({ ...base, dateBasis: 'FIRST_SAVED', from: weekFrom, to: today });
  const failed = [total, unread, favorite, week].some(q => q.isError);
  return <button type="button" className="lib-topic-card" aria-pressed={pressed} onClick={onToggle} style={{ '--lib-topic': topicColor(topic.id) } as CSSProperties}
    title={pressed ? '다시 누르면 주제 조건을 해제합니다' : '이 주제의 보관 자료만 보기'}>
    <span className="lib-topic-top"><span className="lib-topic-label">주제 보관함</span><strong className="lib-topic-total">{countText(total)}<span className="visually-hidden">건 보관</span></strong></span>
    <span className="lib-topic-name">{topic.name}</span>
    <span className="lib-topic-stats">읽지 않음 {countText(unread)} · 즐겨찾기 {countText(favorite)} · 이번 주 새 자료 {countText(week)}</span>
    {failed && <span className="lib-topic-error">일부 개수 조회 실패</span>}
    {pressed && <span className="lib-topic-selected">선택됨 · 다시 누르면 해제</span>}
  </button>;
}

function LibraryRow({ item, topics, selectedTopic, returnTo, onUnsaved }: { item: DocumentResult; topics: Topic[]; selectedTopic: string; returnTo: string; onUnsaved: (title: string) => void }) {
  const links = useDocumentTopicIds(item.documentId);
  const update = useReadingMutation(item.documentId);
  const titleId = useId();
  const linked = links.data ?? [];
  const primaryId = selectedTopic && linked.includes(Number(selectedTopic)) ? Number(selectedTopic) : linked[0];
  const primary = topics.find(t => t.id === primaryId);
  const others = linked.length - (primaryId === undefined ? 0 : 1);
  const detail = `/documents/${item.documentId}?${new URLSearchParams({ returnTo })}`;
  async function unsave() {
    try { await update.mutateAsync({ saved: false }); onUnsaved(item.title); } catch { /* 오류 문구는 아래 alert로 표시한다. */ }
  }
  const topicText = links.isPending ? null : links.isError ? '주제 확인 불가' : primary ? `${primary.name}${others > 0 ? ` 외 ${others}` : ''}` : '주제 미연결';
  return <li className="lib-row" style={{ '--lib-topic': primaryId ? topicColor(primaryId) : 'var(--primary)' } as CSSProperties}>
    <span className="lib-row-bar" aria-hidden="true" />
    <div className="lib-row-main">
      <div className="lib-row-tags">
        <Tag tone={statusTone[item.readingStatus]}>{readingStatusLabel[item.readingStatus]}</Tag>
        {item.favorite && <Tag tone="orange">★ 즐겨찾기</Tag>}
        {item.readLater && <Tag tone="purple">나중에 읽기</Tag>}
      </div>
      <h3 id={titleId} className="lib-row-title"><Link to={detail}>{item.title}</Link></h3>
      <p className="lib-row-meta"><span>{sourceLabel[item.sourceType]}</span><span>{item.domain}</span>{topicText && <span>{topicText}</span>}</p>
      {update.isError && <p className="lib-inline-alert" role="alert">보관 해제 실패: {update.error.message} 보관 상태를 유지했습니다. <button className="button-secondary" disabled={update.isPending} onClick={() => { void unsave(); }}>다시 시도</button></p>}
    </div>
    <div className="lib-row-side">
      <span className="lib-row-day">{relativeDayLabel(item.retrievedAt)}</span>
      <Link className="lib-row-open" to={detail} aria-describedby={titleId}>요약·근거·원문 보기 →</Link>
      <button type="button" className="lib-row-unsave" aria-describedby={titleId} disabled={update.isPending} onClick={() => { void unsave(); }}>{update.isPending ? '해제 중…' : '보관 해제'}</button>
    </div>
  </li>;
}
