import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import PageErrorBoundary from './PageErrorBoundary';
import { aiHealthReason, useAiHealth, useDocumentCount, useTopics } from '../api/queries';
import type { Run, Topic } from '../api/client';
import { lastDocumentId } from '../lib/storage';
import { topicColor } from '../lib/format';

const navigation = [
  { to: '/search', label: '검색·수집', icon: '⌕' },
  { to: '/feed', label: '리서치 피드', icon: '▦' },
  { to: '/stats', label: '주제 분석', icon: '◉' },
  { to: '/library', label: '읽기 보관함', icon: '☰' },
];

/** 주제 한 줄: 실제 자료 수(합성 제외) + 합성(테스트) 자료가 있으면 '테스트 n' 병기. 모두 실제 API 개수. */
function TopicLink({ topic, active }: { topic: Topic; active: boolean }) {
  const real = useDocumentCount({ topicId: String(topic.id), synthetic: 'false' });
  const test = useDocumentCount({ topicId: String(topic.id), synthetic: 'true' });
  const realText = real.data !== undefined ? `실제 자료 ${real.data}건` : real.isError ? '실제 자료 수 확인 불가' : '실제 자료 수 확인 중';
  const testText = test.data ? `, 테스트 자료 ${test.data}건` : '';
  return (
    <Link className="topic-link" to={`/stats?topicId=${topic.id}`} aria-current={active ? 'page' : undefined}
      aria-label={`${topic.name} 주제 분석, ${realText}${testText}`}>
      <span className="topic-dot" style={{ background: topicColor(topic.id) }} aria-hidden="true" />
      <span className="topic-name">{topic.name}</span>
      <span className="topic-count" aria-hidden="true">
        {real.data !== undefined ? real.data : real.isError ? '–' : '…'}
        {test.data ? <small className="topic-test-count">테스트 {test.data}</small> : null}
      </span>
    </Link>
  );
}

function SidebarTopics() {
  const topics = useTopics();
  const location = useLocation();
  const [params] = useSearchParams();
  const activeTopic = location.pathname === '/stats' ? params.get('topicId') : null;

  return (
    <section className="sidebar-topics" aria-labelledby="sidebar-topics-title">
      <h2 className="sidebar-label" id="sidebar-topics-title">관심 주제</h2>
      {topics.isPending ? <p className="sidebar-note" role="status">주제를 불러오는 중…</p>
        : topics.isError ? (
          <div className="sidebar-note" role="alert">
            <p>주제를 불러오지 못했습니다.</p>
            <button type="button" className="sidebar-retry" onClick={() => void topics.refetch()}>다시 시도</button>
          </div>
        )
        : topics.data.length === 0 ? (
          <p className="sidebar-note">아직 주제가 없습니다. <Link to="/search">검색 화면에서 만들기</Link></p>
        ) : (
          <ul className="topic-links">
            {topics.data.map(topic => (
              <li key={topic.id}><TopicLink topic={topic} active={activeTopic === String(topic.id)} /></li>
            ))}
          </ul>
        )}
    </section>
  );
}

function healthView(health: ReturnType<typeof useAiHealth>) {
  if (health.isPending) return { title: 'Ollama 상태 확인 중', detail: '로컬 AI 연결을 확인하고 있습니다', status: '확인 중', tone: 'muted' };
  if (health.isError) return { title: 'Ollama 상태 확인 불가', detail: '서버에서 상태를 받지 못했습니다', status: '확인 불가', tone: 'muted' };
  if (health.data.available) return { title: 'Ollama 연결됨', detail: `${health.data.model} · 로컬 처리`, status: '정상', tone: 'ok' };
  return { title: 'Ollama 연결 안 됨', detail: aiHealthReason(health.data.code), status: '사용 불가', tone: 'warn' };
}

function AiStatusCard() {
  const view = healthView(useAiHealth());
  return (
    <div className="environment-card" role="status" aria-live="polite">
      <strong>{view.title}</strong>
      <span>{view.detail}</span>
      <span className={`environment-status environment-status-${view.tone}`}><span aria-hidden="true">● </span>{view.status}</span>
    </div>
  );
}

/** 데스크톱에서는 항상 펼쳐진 관심 주제·AI 상태. 760px 이하에서는 버튼으로 접고 편다. */
function SidebarExtra() {
  const [open, setOpen] = useState(false);
  const view = healthView(useAiHealth());
  return (
    <div className={`sidebar-extra${open ? '' : ' is-collapsed'}`}>
      <button type="button" className="sidebar-extra-toggle" aria-expanded={open} aria-controls="sidebar-extra-body" onClick={() => setOpen(value => !value)}>
        <span>관심 주제 · AI 상태</span>
        <span className={`environment-status environment-status-${view.tone}`}><span aria-hidden="true">● </span>{view.status}</span>
        <span className="sidebar-extra-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div className="sidebar-extra-body" id="sidebar-extra-body">
        <SidebarTopics />
        <AiStatusCard />
      </div>
    </div>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [title, setTitle] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const openDocument = /^\/documents\/(\d+)/.exec(location.pathname)?.[1];
  const lastDocument = openDocument ?? lastDocumentId();

  // 검색 작업(['search-run', id])이 진행 중 → 종료로 바뀌면 사이드바 주제별 개수를 다시 조회한다.
  useEffect(() => {
    const seen = new Map<string, Run['status']>();
    return queryClient.getQueryCache().subscribe(event => {
      if (event.type !== 'updated' || event.query.queryKey[0] !== 'search-run') return;
      const status = (event.query.state.data as Run | undefined)?.status;
      if (!status) return;
      const key = String(event.query.queryKey[1]);
      const before = seen.get(key);
      seen.set(key, status);
      if ((before === 'QUEUED' || before === 'RUNNING') && status !== 'QUEUED' && status !== 'RUNNING') {
        void queryClient.invalidateQueries({ queryKey: ['saved-documents', 'count'] });
      }
    });
  }, [queryClient]);
  const detailActive = location.pathname.startsWith('/documents');

  // 모바일 가로 메뉴에서 활성 항목이 보이도록 가로 스크롤만 맞춘다(페이지 세로 위치는 건드리지 않음).
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('a.active');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2 });
  }, [location.pathname]);

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <aside className="sidebar">
        <Link className="brand" to="/search">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>ResearchBoard</span>
        </Link>

        <p className="sidebar-label" aria-hidden="true">RESEARCH</p>
        <nav className="sidebar-nav" aria-label="주요 메뉴" ref={navRef}>
          {navigation.map(item => (
            <NavLink key={item.to} to={item.to}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          <Link to={lastDocument ? `/documents/${lastDocument}` : '/documents'} className={detailActive ? 'active' : undefined} aria-current={detailActive ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden="true">▧</span>
            자료 상세
          </Link>
        </nav>

        <SidebarExtra key={location.pathname + location.search} />
      </aside>

      <div className="app-content">
        <header className="topbar">
          <form className="global-search" role="search" onSubmit={e => { e.preventDefault(); navigate(`/documents?${new URLSearchParams({ title: title.trim() })}`); }}>
            <label className="visually-hidden" htmlFor="global-title">저장한 자료 제목 찾기</label>
            <button type="submit" className="global-search-submit" aria-label="제목 찾기"><span aria-hidden="true">⌕</span></button>
            <input id="global-title" type="search" maxLength={200} value={title} placeholder="저장한 자료 제목 찾기"
              onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) e.preventDefault(); }}
              onChange={e => setTitle(e.target.value)} />
          </form>
          <Link className="new-search-link" to="/search">새 자료 검색</Link>
        </header>
        <main id="main-content" tabIndex={-1}>
          <PageErrorBoundary key={location.pathname}><Outlet /></PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
