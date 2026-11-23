import { Component } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export default class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="state-card" role="alert">
      <h2>이 화면을 표시하지 못했습니다</h2>
      <button onClick={() => window.location.reload()}>페이지 다시 불러오기</button>
      <Link to="/search">검색으로 이동</Link>
      <Link to="/library">내 보관함으로 이동</Link>
    </section>;
  }
}
