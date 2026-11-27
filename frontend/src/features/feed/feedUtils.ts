/** 리서치 피드 화면 전용 상수·도우미(컴포넌트가 아닌 것만 둔다). */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AiJobs, Brief, Readiness } from '../../api/queries';
import { latestValidJob, parseAiResult } from '../../api/queries';
import { request } from '../../api/client';
import type { RunStatus } from '../../api/client';
import { lastBriefId } from '../../lib/storage';

export type FeedSort = 'FETCHED_DESC' | 'PUBLISHED_DESC' | 'TITLE_ASC';
export const sortOptions: { value: FeedSort; label: string }[] = [
  { value: 'FETCHED_DESC', label: '최근 수집순' },
  { value: 'PUBLISHED_DESC', label: '발행일순' },
  { value: 'TITLE_ASC', label: '제목순' },
];

export type FeedTab = 'ALL' | 'OFFICIAL' | 'USER' | 'OTHER' | 'UNREAD';
export const tabValues: FeedTab[] = ['ALL', 'OFFICIAL', 'USER', 'OTHER', 'UNREAD'];
export const tabLabels: Record<FeedTab, string> = { ALL: '전체', OFFICIAL: '공식', USER: '사용자', OTHER: '기타', UNREAD: '읽지 않음' };

export const PAGE_SIZE = 10;

export const readinessLabel: Record<Readiness, string> = {
  READY: '분석 완료',
  RUNNING: '분석 중',
  STALE: '재분석 필요',
  NOT_ANALYZED: '미분석',
  FAILED: '분석 실패',
};

export const runStatusLabel: Record<RunStatus, string> = {
  QUEUED: '대기',
  RUNNING: '진행 중',
  SUCCEEDED: '완료',
  PARTIAL: '일부 완료',
  FAILED: '실패',
};

/** /documents 조회 조건. 탭별 출처 유형·읽기 상태는 호출부가 덧붙인다. */
export function baseFilter(topicId: string): Record<string, string> {
  const filter: Record<string, string> = {};
  if (topicId) filter.topicId = topicId;
  return filter;
}

export function tabFilter(tab: FeedTab): Record<string, string> {
  if (tab === 'UNREAD') return { readingStatus: 'UNREAD' };
  if (tab === 'ALL') return {};
  return { sourceType: tab };
}

/** 처음 수집한 지 24시간 이내인지(retrievedAt 기준). */
export function isNewDocument(retrievedAt: string | null | undefined): boolean {
  if (!retrievedAt) return false;
  const time = Date.parse(retrievedAt);
  return Number.isFinite(time) && Date.now() - time >= 0 && Date.now() - time < 86400000;
}

export type AnalysisCounts = { claims: number; evidence: number; limitations: number };

/** 최신 성공 분석에서 핵심 주장·근거(quote가 있는 주장)·한계 수를 센다. 결과를 읽을 수 없으면 undefined. */
export function analysisCounts(data: AiJobs | undefined): AnalysisCounts | undefined {
  const job = data ? latestValidJob(data.jobs) : undefined;
  const result = parseAiResult(job?.result_json);
  if (!result) return undefined;
  return {
    claims: result.claims.length,
    evidence: result.claims.filter(claim => claim.quote.trim().length > 0).length,
    limitations: result.limitations.length,
  };
}

export type LastBrief = { briefId: number | null; query: UseQueryResult<Brief, Error> };

/** 마지막 자료 요약 모음. 이 브라우저에 기억한 번호가 없으면 서버의 가장 최근 모음을 쓴다(/brief와 같은 키 ['brief', id]). */
export function useLastBrief(): LastBrief {
  const [remembered] = useState(() => lastBriefId());
  const latest = useQuery({
    queryKey: ['brief', 'latest'],
    enabled: remembered === null,
    queryFn: ({ signal }) => request<{ briefId: number }>('/ai/briefs/latest', undefined, signal),
    retry: false,
  });
  const briefId = remembered ?? latest.data?.briefId ?? null;
  const query = useQuery({
    queryKey: ['brief', briefId],
    enabled: briefId !== null,
    queryFn: ({ signal }) => request<Brief>(`/ai/briefs/${briefId}`, undefined, signal),
    retry: false,
    refetchInterval: q => ['QUEUED', 'RUNNING'].includes(q.state.data?.synthesisStatus ?? '') ? 3000 : false,
  });
  return { briefId, query };
}

/** 자료의 연결 주제 id 목록. 키 ['document-topics', id]는 상세·보관함 화면과 공유한다. */
export function useDocumentTopicIds(documentId: number) {
  return useQuery({
    queryKey: ['document-topics', documentId],
    queryFn: ({ signal }) => request<number[]>(`/documents/${documentId}/topics`, undefined, signal),
    retry: false,
  });
}
