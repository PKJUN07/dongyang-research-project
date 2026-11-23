type StateProps = {
  title: string;
  description?: string;
};

export function LoadingState({ title, description }: StateProps) {
  return (
    <div className="state-card" role="status" aria-live="polite">
      <span className="state-icon" aria-hidden="true">◌</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function EmptyState({ title, description }: StateProps) {
  return (
    <div className="state-card">
      <span className="state-icon" aria-hidden="true">◇</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

type ErrorStateProps = StateProps & {
  onRetry: () => void;
};

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <div className="state-card" role="alert">
      <span className="state-icon state-icon-error" aria-hidden="true">!</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      <button type="button" onClick={onRetry}>다시 시도</button>
    </div>
  );
}
