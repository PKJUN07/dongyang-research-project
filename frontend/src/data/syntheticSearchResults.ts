export type SyntheticSearchResult = {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sourceType: "official" | "user";
  sourceLabel: string;
};

export const syntheticSearchResults: SyntheticSearchResult[] = [
  {
    id: "official-long-horizon",
    title: "시험용 공식 자료로 확인하는 AI 에이전트 장기 작업 안전성과 실행 기록 기반 복구 원칙",
    url: "https://example.com/official",
    domain: "example.com",
    snippet: "긴 한글 제목의 줄바꿈과 공식 자료 배지, 상세 이동을 확인하기 위한 합성 자료입니다.",
    sourceType: "official",
    sourceLabel: "공식 후보",
  },
  {
    id: "user-review",
    title: "시험용 사용자 후기와 서로 다른 사용 시점 비교",
    url: "https://example.com/review",
    domain: "example.com",
    snippet: "사용자 글 후보가 공식 후보와 시각적으로 구분되는지 확인하기 위한 합성 자료입니다.",
    sourceType: "user",
    sourceLabel: "사용자 글 후보",
  },
];
