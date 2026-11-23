import type { ReactNode } from 'react';

type PageHeaderProps = {
  /** 이전 화면 호환용. 참고 이미지에 없어 화면에 표시하지 않는다. */
  eyebrow?: string;
  title: ReactNode;
  description: string;
  /** 오른쪽 보조 버튼 자리(필터 및 정렬, 목록으로 등). */
  actions?: ReactNode;
};

/** 페이지 큰 제목 + 회색 설명, 오른쪽 보조 버튼 슬롯. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
