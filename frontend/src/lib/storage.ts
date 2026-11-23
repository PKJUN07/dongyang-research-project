/** 브라우저 localStorage에 마지막 열람 자료와 마지막 요약 모음 id를 기억한다. 저장소를 못 쓰면 조용히 무시한다. */

const LAST_DOCUMENT = 'researchboard.lastDocumentId';
const LAST_BRIEF = 'researchboard.lastBriefId';

function write(key: string, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return;
  try { window.localStorage.setItem(key, String(id)); } catch { /* 저장소 사용 불가: 기억하지 않는다. */ }
}

function read(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** 자료 상세를 열 때 호출: 사이드바 '자료 상세' 링크가 이 자료로 이동한다. */
export function rememberLastDocument(id: number) { write(LAST_DOCUMENT, id); }
/** 마지막으로 연 자료 id, 없으면 null. */
export function lastDocumentId(): number | null { return read(LAST_DOCUMENT); }
/** 자료 요약 모음을 만들거나 열 때 호출. */
export function rememberBrief(id: number) { write(LAST_BRIEF, id); }
/** 마지막 자료 요약 모음 id, 없으면 null. */
export function lastBriefId(): number | null { return read(LAST_BRIEF); }
