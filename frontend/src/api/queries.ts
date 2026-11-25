/** 여러 화면이 함께 쓰는 TanStack Query 훅과 API 응답 타입. queryKey는 기존 화면 관례와 같게 유지한다. */
import { useQueries, useQuery } from '@tanstack/react-query';
import { request } from './client';
import type { Config, ResultPage, SourceType, Topic } from './client';

export type StatsOverview = {
  from: string; to: string; timezone: string;
  total: number; read: number; saved: number; favorite: number; readLater: number; synthetic: number; readPercent: number;
  daily: { date: string; count: number }[];
  sources: { type: SourceType; count: number }[];
  readingCounts: { status: 'UNREAD' | 'READING' | 'READ'; count: number }[];
};
/** /api/stats/history 항목. id는 검색 세션(runId). raw/excluded는 기록되지 않았으면 null. */
export type HistoryItem = {
  id: number; topic: string; provider: string; synthetic: boolean; status: string;
  startedAt: string; finishedAt: string | null; errorCode: string | null;
  raw: number | null; excluded: number | null; valid: number; unique: number;
  created: number; existing: number; duplicates: number; bodyFailures: number;
};
export type HistoryPage = { items: HistoryItem[]; total: number; page: number; size: number };
export type AiHealth = { available: boolean; code: string; model: string };
export type AiJob = {
  id: number; document_id?: number;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  model: string; input_type: 'BODY' | 'SNIPPET' | string;
  result_json: string | null; error_code: string | null;
  created_at: string; finished_at?: string | null; stale: boolean;
};
export type AiResult = { summary: string; claims: { text: string; quote: string }[]; limitations: string[]; inferences: string[] };
export type AiJobs = { jobs: AiJob[]; inputAvailable: boolean; model: string; promptVersion: string };
export type Readiness = 'READY' | 'RUNNING' | 'STALE' | 'NOT_ANALYZED' | 'FAILED';
/** 자료 요약 모음 스냅샷 한 항목(생성 시점의 최신 성공 분석 포함). */
export type BriefEntry = { documentId: number; title: string; url: string; sourceType: SourceType; analysis: AiJob };
/** 교차 정리 항목이 가리키는 근거: 스냅샷의 source(0부터)번째 자료의 claim(0부터)번째 핵심 주장. */
export type BriefRef = { source: number; claim: number };
export type BriefItem = { text: string; refs: BriefRef[] };
export type BriefSynthesis = {
  overview: string;
  common: BriefItem[];
  differences: (BriefItem & { topic: string })[];
  checks: BriefItem[];
  answer?: BriefItem;
};
export type SynthesisStatus = 'NONE' | 'NOT_APPLICABLE' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type Brief = {
  briefId: number; snapshot: BriefEntry[]; createdAt: string;
  question?: string | null; synthesisStatus?: SynthesisStatus; synthesis?: BriefSynthesis | null;
  synthesisError?: string | null; synthesisModel?: string | null; currentModel?: string;
};

/**
 * 모델이 반복하는 '발췌문만 사용해 원문 전체 맥락을 모른다'류 문장. 입력 유형은 화면이 따로 알리므로
 * 이전에 저장된 분석에서도 한계 목록에서 뺀다(서버 AiController.SCOPE_BOILERPLATE와 같은 규칙).
 */
const scopeBoilerplate = /(발췌|스니펫|검색\s*요약|검색\s*결과|일부\s*(내용|구간|본문)).{0,40}(맥락|전체|원문|파악|확인)|원문\s*전체|전체\s*(맥락|내용)을?\s*(파악|확인|알)/;
export function meaningfulLimitations(limitations: string[]): string[] {
  return limitations.filter(item => !scopeBoilerplate.test(item));
}

/** 주제 목록. 기존 TopicPanel 등과 같은 키 ['topics']. */
export function useTopics() {
  return useQuery({ queryKey: ['topics'], queryFn: ({ signal }) => request<Topic[]>('/topics', undefined, signal) });
}

/** 검색 설정·예산. 기존 검색 화면과 같은 키 ['config']. */
export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: ({ signal }) => request<Config>('/config', undefined, signal) });
}

/** 로컬 AI(Ollama) 연결 상태. AiPanel과 같은 키·옵션: 사용 불가이면 10초마다 다시 확인. */
export function useAiHealth() {
  return useQuery({
    queryKey: ['ai-health'],
    queryFn: ({ signal }) => request<AiHealth>('/ai/health', undefined, signal),
    retry: false,
    refetchInterval: query => query.state.data?.available ? false : 10000,
  });
}

/** AI 연결 불가 코드의 짧은 한국어 사유. */
export function aiHealthReason(code: string | undefined): string {
  switch (code) {
    case 'AI_NOT_RUNNING': return 'Ollama 미실행';
    case 'MODEL_MISSING': return '모델 미설치';
    case 'AI_DISABLED': return 'AI 비활성화';
    default: return '연결 확인 불가';
  }
}

function countQuery(params: Record<string, string>) {
  const entries = Object.entries(params).filter(([key]) => key !== 'size' && key !== 'page').sort(([a], [b]) => a.localeCompare(b));
  const search = new URLSearchParams(entries).toString();
  return {
    queryKey: ['saved-documents', 'count', search],
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      (await request<ResultPage>(`/documents?${search}${search ? '&' : ''}size=1`, undefined, signal)).totalElements,
    retry: false,
  };
}

/**
 * /documents 조건에 맞는 자료 수(totalElements). size=1로 조회한다.
 * 키 접두사가 ['saved-documents']라서 읽기 상태·주제 연결 변경 시 함께 갱신된다.
 */
export function useDocumentCount(params: Record<string, string>) {
  return useQuery(countQuery(params));
}

export type TopicCount = { topicId: number; count: number | undefined };

/** 주제별 자료 수. data는 주제 목록 순서, 아직 못 받은 개수는 undefined. */
export function useTopicCounts() {
  const topics = useTopics();
  return useQueries({
    queries: (topics.data ?? []).map(topic => countQuery({ topicId: String(topic.id) })),
    combine: results => ({
      data: (topics.data ?? []).map((topic, index): TopicCount => ({ topicId: topic.id, count: results[index]?.data })),
      isPending: topics.isPending || results.some(result => result.isPending),
      isError: topics.isError || results.some(result => result.isError),
    }),
  });
}

/** 분석 결과 JSON을 안전하게 읽는다. 형식이 맞지 않으면 undefined. */
export function parseAiResult(json: string | null | undefined): AiResult | undefined {
  if (!json) return undefined;
  try {
    const value = JSON.parse(json) as Partial<AiResult> | null;
    if (!value || typeof value !== 'object' || typeof value.summary !== 'string') return undefined;
    const strings = (list: unknown) => Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
    const claims = Array.isArray(value.claims)
      ? value.claims.filter(claim => claim && typeof claim.text === 'string' && typeof claim.quote === 'string')
      : [];
    return { summary: value.summary, claims, limitations: strings(value.limitations), inferences: strings(value.inferences) };
  } catch {
    return undefined;
  }
}

/** AiPanel과 같은 규칙: stale이 아닌 성공 분석을 우선, 없으면 가장 최근 성공 분석. */
export function latestValidJob(jobs: AiJob[]): AiJob | undefined {
  return jobs.find(job => job.status === 'SUCCEEDED' && !job.stale) ?? jobs.find(job => job.status === 'SUCCEEDED');
}

/**
 * /stats/history 전체 페이지(10건/페이지)를 최대 maxPages까지 모아 반환한다.
 * truncated가 true면 기간 안 이력이 더 있지만 상한 때문에 다 읽지 못한 것이다.
 */
export async function fetchAllHistory(scope: URLSearchParams, maxPages = 20, signal?: AbortSignal): Promise<{ items: HistoryItem[]; total: number; truncated: boolean }> {
  const base = new URLSearchParams(scope);
  base.delete('page');
  const items: HistoryItem[] = [];
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    base.set('page', String(page));
    const result = await request<HistoryPage>(`/stats/history?${base}`, undefined, signal);
    total = result.total;
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= total) break;
  }
  return { items, total, truncated: items.length < total };
}
