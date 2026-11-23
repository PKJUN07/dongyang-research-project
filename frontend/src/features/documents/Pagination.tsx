export function Pagination({ page, totalPages, pending, onChange }: { page: number; totalPages: number; pending: boolean; onChange: (page: number) => void }) {
  if (!totalPages) return null;
  return <nav className="pagination" aria-label="자료 페이지 이동"><button disabled={pending || page <= 0} onClick={() => onChange(page - 1)}>이전 페이지</button><span aria-live="polite">{totalPages ? page + 1 : 0} / {totalPages} 페이지</span><button disabled={pending || page + 1 >= totalPages} onClick={() => onChange(page + 1)}>다음 페이지</button></nav>;
}
