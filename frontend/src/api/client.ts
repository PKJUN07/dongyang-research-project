export type Topic = { id: number; name: string; query: string; createdAt: string };
export type Run = {
  runId: number; topicId: number; query: string; provider: string; synthetic: boolean;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  discoveredCount: number; processedCount: number; failureCount: number; errorCode: string | null;
};
export type DocumentResult = {
  documentId: number; title: string; url: string; snippet: string; rank: number;
  sourceType: 'OFFICIAL' | 'USER' | 'OTHER'; classificationReason: string;
  publishedAt: string | null; synthetic: boolean;
  extractionStatus: 'SUCCESS' | 'METADATA_ONLY' | 'BLOCKED' | 'FAILED';
  extractionReason: string | null; contentText: string | null; fetchedAt: string | null; classifiedAt: string | null;
  domain: string; retrievedAt: string; contentVersion: number; duplicateCandidateCount: number; readingStatus: 'UNREAD' | 'READING' | 'READ'; saved: boolean; favorite: boolean; readLater: boolean;
};
export type ResultPage = { items: DocumentResult[]; totalElements: number; page: number; size: number; totalPages: number };
export type Config = { provider: string; synthetic: boolean; aiEnabled: boolean; externalSearchReady: boolean; searchReason: string; attempts: number; maximum: number; remaining: number };
export class ApiError extends Error {
  code: string;
  readonly status?: number;
  constructor(code: string, message: string, status?: number) { super(message); this.code = code; this.status = status; }
}
export type ReadingState = { readStatus: 'UNREAD' | 'READING' | 'READ'; saved: boolean; favorite: boolean; readLater: boolean; updatedAt: string | null };
export type Note = { text: string; version: number; updatedAt: string | null };
export async function request<T>(path: string, body?: unknown, signal?: AbortSignal, method?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal,
  }).catch((error: unknown) => {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new ApiError('NETWORK_ERROR', '서버에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도하세요.');
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const code = typeof error?.code === 'string' ? error.code : response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
    const message = typeof error?.message === 'string' ? error.message : response.status >= 500
      ? `서버가 요청을 처리하지 못했습니다 (${response.status}). 다시 시도하세요.`
      : `요청을 완료하지 못했습니다 (${response.status}).`;
    throw new ApiError(code, message, response.status);
  }
  const data = await response.json().catch((error: unknown) => {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new ApiError('INVALID_RESPONSE', '서버 응답 형식을 읽을 수 없습니다. 다시 시도하세요.', response.status);
  });
  if (data === null || typeof data !== 'object') {
    throw new ApiError('INVALID_RESPONSE', '서버 응답 형식이 올바르지 않습니다. 다시 시도하세요.', response.status);
  }
  return data;
}
export const activeRun = (run?: Run) => run?.status === 'QUEUED' || run?.status === 'RUNNING';
export const sourceLabel = { OFFICIAL: '공식', USER: '사용자', OTHER: '기타' };
export const extractionLabel = { SUCCESS: '본문 확인 완료', METADATA_ONLY: '검색 요약만 제공', BLOCKED: '본문 접근 제한', FAILED: '본문 추출 실패' };
export function safeLink(url: string) {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; }
  catch { return false; }
}
