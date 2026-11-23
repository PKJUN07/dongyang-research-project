import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { HistoryItem, HistoryPage } from '../../api/queries';
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState';
import { Card, Tag } from '../../components/ui';
import type { TagTone } from '../../components/ui';
import { formatKstDateTime } from '../../lib/format';
import { errorLabel, providerLabel } from './statsData';

const statusText: Record<string, string> = { QUEUED: '대기 중', RUNNING: '처리 중', SUCCEEDED: '완료', PARTIAL: '일부 본문 확인 불가', FAILED: '실패' };
const statusTone: Record<string, TagTone> = { QUEUED: 'purple', RUNNING: 'purple', SUCCEEDED: 'green', PARTIAL: 'orange', FAILED: 'red' };
const dateText = (date: string | null) => date ? formatKstDateTime(date) : '아직 완료되지 않음';

function RunRow({ run }: { run: HistoryItem }) {
  return (
    <li className="stats-run">
      <div className="stats-run-head">
        <h3>{run.topic} · 검색 #{run.id}</h3>
        <div className="card-tags">
          <Tag tone={statusTone[run.status] ?? 'gray'}>{statusText[run.status] || run.status}</Tag>
          <Tag tone={run.synthetic ? 'purple' : 'gray'}>{providerLabel(run.provider, run.synthetic)}</Tag>
        </div>
      </div>
      <p className="stats-run-time">시작 {dateText(run.startedAt)} · 완료 {dateText(run.finishedAt)} (KST)</p>
      <p className="stats-run-counts">
        <span>중복 정리 후 <strong>{run.unique}건</strong></span>
        <span>새로 저장 <strong>{run.created}건</strong></span>
        <span>기존 자료 <strong>{run.existing}건</strong></span>
        <span>확정 중복 <strong>{run.duplicates}건</strong></span>
      </p>
      {run.status === 'PARTIAL' && <p className="stats-run-note">검색 결과는 저장했습니다. 일부 자료의 본문은 확인할 수 없어 검색 요약과 원문 링크를 제공합니다.</p>}
      {run.status === 'FAILED' && <p className="stats-run-note" role="status">검색이 완료되지 않았습니다. 기존에 보관한 자료와 메모는 그대로 이용할 수 있습니다. 사유: {errorLabel(run.errorCode)}</p>}
      <div className="stats-run-actions">
        {run.unique > 0 && <Link className="button-link-secondary stats-run-link" to={'/documents?runId=' + run.id}>이 검색의 자료 {run.unique}건 보기 →</Link>}
        <details className="stats-details">
          <summary>집계 상세 보기</summary>
          <p>원시 수신 {run.raw ?? '미기록'} · 제외 {run.excluded ?? '미기록'} · 저장 처리한 유효 결과 {run.valid} · 확정 중복 {run.duplicates} · 본문 확인 불가 {run.bodyFailures}{run.errorCode ? ` · 오류 코드 ${run.errorCode}` : ''}</p>
          <p>유효 결과 = 고유 자료 + 확정 중복입니다. 제외에는 무효 URL·개수 상한 초과가 포함됩니다. 이전 버전의 원시 수신·제외 수는 미기록으로 표시합니다. 처리 실패 시 받은 결과가 모두 저장되지 않았을 수 있습니다.</p>
        </details>
      </div>
    </li>
  );
}

/** 기존 '검색 작업 이력' 표(페이지 10건, runId 결과 링크, 진행 중 폴링은 호출부 쿼리 옵션). */
export function StatsHistory({ history, page, onPage }: { history: UseQueryResult<HistoryPage>; page: number; onPage: (page: number) => void }) {
  const data = history.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / 10)) : 0;
  return (
    <Card className="stats-history" title={<span id="search-history">검색 이력</span>} aside={data ? `검색 ${data.total}회${data.total > 10 ? ` · ${page + 1} / ${pages}페이지` : ''}` : undefined}>
      <p className="stats-help">선택 기간에 <strong>시작한</strong> 검색 작업입니다(자료 집계의 '처음 저장일' 기준과 다릅니다). 재검색도 별도 작업으로 표시하며, 결과는 검색 당시의 자료 연결을 보여줍니다.</p>
      {history.isPending && <LoadingState title="검색 이력 불러오는 중" />}
      {history.isError && !data && <ErrorState title="검색 이력을 불러오지 못했습니다" description={history.error.message} onRetry={() => void history.refetch()} />}
      {data && <>
        {!data.items.length && <EmptyState title="이 기간에 시작한 검색이 없습니다" description="필터 및 정렬에서 기간이나 주제 조건을 변경해 보세요." />}
        {data.items.length > 0 && <ol className="stats-run-list">{data.items.map(run => <RunRow key={run.id} run={run} />)}</ol>}
        {data.total > 10 && (
          <nav className="stats-pagination" aria-label="검색 이력 페이지">
            <button type="button" className="button-secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>이전</button>
            <span>{page + 1} / {pages}페이지</span>
            <button type="button" className="button-secondary" disabled={(page + 1) * 10 >= data.total} onClick={() => onPage(page + 1)}>다음</button>
          </nav>
        )}
      </>}
    </Card>
  );
}
