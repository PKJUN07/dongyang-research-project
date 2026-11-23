/** 공통 표시 형식(KST 기준 시각·날짜, 상대 시간, 읽기 시간, 색상) 도우미. */

/** Tag 컴포넌트가 받는 색 이름. */
export type TagTone = 'purple' | 'green' | 'orange' | 'gray' | 'blue' | 'red';

const KST_OFFSET = 9 * 3600000;
const DAY = 86400000;

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

/** 밀리초 시각의 KST 날짜(YYYY-MM-DD). */
function kstDay(time: number) {
  return new Date(time + KST_OFFSET).toISOString().slice(0, 10);
}

/** KST 기준 HH:MM:SS. 값이 없거나 잘못되면 '-'. */
export function formatKstTime(iso: string | null | undefined): string {
  const time = parse(iso);
  return time === null ? '-' : new Date(time + KST_OFFSET).toISOString().slice(11, 19);
}

/** KST 기준 YYYY-MM-DD HH:MM. 값이 없거나 잘못되면 '-'. */
export function formatKstDateTime(iso: string | null | undefined): string {
  const time = parse(iso);
  if (time === null) return '-';
  const text = new Date(time + KST_OFFSET).toISOString();
  return `${text.slice(0, 10)} ${text.slice(11, 16)}`;
}

/** KST 달력 날짜 기준 '오늘 저장' / '어제 저장' / 'N일 전'. 값이 없으면 '-'. */
export function relativeDayLabel(iso: string | null | undefined, now = Date.now()): string {
  const time = parse(iso);
  if (time === null) return '-';
  const days = Math.round((Date.parse(kstDay(now)) - Date.parse(kstDay(time))) / DAY);
  if (days <= 0) return '오늘 저장';
  if (days === 1) return '어제 저장';
  return `${days}일 전`;
}

/** '방금 전' / 'N분 전' / 'N시간 전' / 'N일 전'. 값이 없으면 '-'. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  const time = parse(iso);
  if (time === null) return '-';
  const minutes = Math.floor(Math.max(0, now - time) / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/** 공백을 뺀 글자 수 기준 약 500자/분, 반올림, 최소 1분. 본문이 없을 때는 호출부에서 표시를 생략한다. */
export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.replace(/\s+/g, '').length / 500));
}

/** 오늘(KST)에서 offsetDays만큼 이동한 날짜 YYYY-MM-DD. */
export function kstDate(offsetDays = 0): string {
  return kstDay(Date.now() + offsetDays * DAY);
}

/** 출처 유형별 Tag 색. 사용: sourceTone[document.sourceType] */
export const sourceTone: Record<'OFFICIAL' | 'USER' | 'OTHER', TagTone> = {
  OFFICIAL: 'green',
  USER: 'blue',
  OTHER: 'gray',
};

const topicPalette = ['#7c5cf0', '#22a06b', '#e8952b', '#3b82f6', '#d6458b', '#0e9aa7'];

/** 주제 id로 고정 팔레트 색을 고른다(id 1 → 보라, 2 → 초록 …). */
export function topicColor(topicId: number): string {
  const index = ((Math.trunc(topicId) - 1) % topicPalette.length + topicPalette.length) % topicPalette.length;
  return topicPalette[Number.isFinite(index) ? index : 0];
}
