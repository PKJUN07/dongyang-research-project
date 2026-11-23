/** 여러 화면이 함께 쓰는 작은 UI 조각. 스타일은 index.css의 공통 클래스를 사용한다. */
import { useId } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { TagTone } from '../lib/format';

export type { TagTone };

/** 흰 카드. title이 있으면 제목 행을 만들고 오른쪽에 aside를 둔다. */
export function Card({ title, aside, className, children, as: Element = 'section' }: {
  title?: ReactNode; aside?: ReactNode; className?: string; children?: ReactNode; as?: 'section' | 'article' | 'div' | 'aside';
}) {
  const titleId = useId();
  const labelled = title !== undefined && Element !== 'div';
  return (
    <Element className={['card', className].filter(Boolean).join(' ')} aria-labelledby={labelled ? titleId : undefined}>
      {(title !== undefined || aside !== undefined) && (
        <div className="card-header">
          {title !== undefined && <h2 className="card-title" id={titleId}>{title}</h2>}
          {aside !== undefined && <div className="card-aside">{aside}</div>}
        </div>
      )}
      {children}
    </Element>
  );
}

/** 작은 라운드 태그 칩. */
export function Tag({ tone = 'gray', children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

/** KPI 타일: 작은 라벨 + 큰 숫자. to가 있으면 해당 목록으로 가는 링크가 된다. */
export function StatTile({ label, value, tone, to, hint }: {
  label: ReactNode; value: ReactNode; tone?: TagTone; to?: string; hint?: ReactNode;
}) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <strong className={`stat-value${tone ? ` stat-value-${tone}` : ''}`}>{value}</strong>
      {hint !== undefined && <span className="stat-hint">{hint}</span>}
    </>
  );
  return to
    ? <Link className="stat-tile stat-tile-link" to={to}>{body}</Link>
    : <div className="stat-tile">{body}</div>;
}

/** 좌측 테두리 안내 카드. warning=주황(기본), info=보라. */
export function Notice({ tone = 'warning', title, children }: { tone?: 'warning' | 'info'; title: ReactNode; children?: ReactNode }) {
  return (
    <div className={`notice-card notice-${tone}`}>
      <strong className="notice-title">{title}</strong>
      {children !== undefined && <div className="notice-body">{children}</div>}
    </div>
  );
}

/** 보라 그라데이션 진행 막대. label은 화면에 보이고 스크린리더 이름으로도 쓰인다. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const safeMax = Math.max(0, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  const percent = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;
  const labelId = useId();
  return (
    <div className="progress">
      <span className="progress-label" id={labelId}>{label}</span>
      <div className="progress-track" role="progressbar" aria-labelledby={labelId}
        aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={safeValue} aria-valuetext={`${safeMax}건 중 ${safeValue}건`}>
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** '전체 22 / 공식 5 …' 형태의 선택 칩 묶음. 버튼 그룹 + aria-pressed. */
export function ChipTabs<T extends string>({ items, value, onChange, ariaLabel }: {
  items: { value: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void; ariaLabel: string;
}) {
  return (
    <div className="chip-tabs" role="group" aria-label={ariaLabel}>
      {items.map(item => (
        <button key={item.value} type="button" className="chip-tab" aria-pressed={item.value === value} onClick={() => onChange(item.value)}>
          {item.label}
          {item.count !== undefined && <span className="chip-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** 정사각 아이콘 토글 버튼(나중에 읽기·즐겨찾기 등). 이름은 숨김 텍스트와 title로 제공. */
export function IconToggle({ pressed, label, icon, onClick, disabled }: {
  pressed: boolean; label: string; icon: ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" className="icon-toggle" aria-pressed={pressed} title={label} onClick={onClick} disabled={disabled}>
      <span aria-hidden="true">{icon}</span>
      <span className="visually-hidden">{label}</span>
    </button>
  );
}

const skeletonWidths = ['28%', '64%', '86%', '52%', '74%'];

/** 회색 막대 로딩 자리표시. 스크린리더용 상태 문구는 호출부에서 role="status"로 제공한다. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span key={index} className="skeleton-line" style={{ width: skeletonWidths[index % skeletonWidths.length] }} />
      ))}
    </div>
  );
}

export type StepState = 'done' | 'active' | 'waiting' | 'error';
const stepIcon: Record<StepState, string> = { done: '✓', active: '●', waiting: '○', error: '!' };
const stepText: Record<StepState, string> = { done: '완료', active: '진행 중', waiting: '대기', error: '오류' };

/** 원형 상태 아이콘이 붙은 단계 목록. 상태는 숨김 텍스트로도 읽힌다. */
export function StepList({ steps }: {
  steps: { key: string; title: string; description: string; state: StepState; meta?: string }[];
}) {
  return (
    <ol className="step-list">
      {steps.map(step => (
        <li key={step.key} className={`step step-${step.state}`}>
          <span className="step-icon" aria-hidden="true">{stepIcon[step.state]}</span>
          <div className="step-text">
            <strong><span className="visually-hidden">{stepText[step.state]}: </span>{step.title}</strong>
            <span>{step.description}</span>
          </div>
          {step.meta !== undefined && <span className="step-meta">{step.meta}</span>}
        </li>
      ))}
    </ol>
  );
}

/** 시각(HH:MM:SS) + 내용으로 된 기록 목록. */
export function Timeline({ entries }: { entries: { time: string; text: string; tone?: 'default' | 'active' }[] }) {
  return (
    <ol className="timeline">
      {entries.map((entry, index) => (
        <li key={`${entry.time}-${index}`} className={entry.tone === 'active' ? 'timeline-active' : undefined}>
          <span className="timeline-time">{entry.time}</span>
          <span className="timeline-text">{entry.text}</span>
        </li>
      ))}
    </ol>
  );
}
