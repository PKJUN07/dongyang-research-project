import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from 'react';
import PageErrorBoundary from './PageErrorBoundary';

const navigation = [
  { to: "/search", label: "검색·수집", icon: "⌕" },
  { to: "/documents", label: "전체 수집 자료", icon: "▧" },
  { to: "/library", label: "내 보관함", icon: "▤" },
  { to: "/stats", label: "통계·검색 이력", icon: "◉" },
  { to: "/brief", label: "자료 요약 모음", icon: "▧" },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [title, setTitle] = useState('');
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>ResearchBoard</span>
        </div>

        <p className="sidebar-label">RESEARCH</p>
        <nav aria-label="주요 메뉴">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="environment-card">
          <strong>로컬 리서치 보드</strong>
          <span>찾은 자료를 모으고<br />나만의 메모를 남기세요.</span>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <form className="global-search" onSubmit={e => { e.preventDefault(); navigate(`/documents?${new URLSearchParams({ title: title.trim() })}`); }}><label className="visually-hidden" htmlFor="global-title">전체 저장 자료 제목 찾기</label><input id="global-title" type="search" onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) e.preventDefault(); }} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="저장한 자료에서 찾기" /><button type="submit" className="button-secondary">찾기</button></form>
          <Link className="new-search-link" to="/search">+ 새 자료 검색</Link>
        </header>
        <main id="main-content" tabIndex={-1}>
          <PageErrorBoundary key={location.pathname}><Outlet /></PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
