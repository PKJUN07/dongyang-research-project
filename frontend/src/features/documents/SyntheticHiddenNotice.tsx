/** 합성(테스트) 자료가 숨겨져 있음을 알리는 한 줄 안내와 포함/숨김 토글. */
export function SyntheticHiddenNotice({ hidden, included, onToggle }: { hidden: number; included: boolean; onToggle: (include: boolean) => void }) {
  if (included) return <p className="synthetic-line"><span>테스트(합성) 자료를 함께 표시하고 있습니다.</span><button type="button" className="button-secondary" onClick={() => onToggle(false)}>테스트 자료 숨기기</button></p>;
  if (hidden <= 0) return null;
  return <p className="synthetic-line"><span>이 조건에 테스트(합성) 자료 {hidden.toLocaleString()}건이 숨겨져 있습니다.</span><button type="button" className="button-secondary" onClick={() => onToggle(true)}>테스트 자료 포함해서 보기</button></p>;
}
