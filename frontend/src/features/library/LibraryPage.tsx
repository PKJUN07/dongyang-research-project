import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { LibraryBoard } from './LibraryBoard';

/** '보관함 관리' 패널에서만 바꿀 수 있는 조건(주제·상태 칩·정렬 이외). */
const managedKeys = ['title', 'sourceType', 'from', 'to', 'dateBasis', 'includeUnknown', 'size'];

export default function LibraryPage() {
  const [params] = useSearchParams();
  const managed = managedKeys.some(key => Boolean(params.get(key)));
  const [open, setOpen] = useState(managed);
  return (
    <section className="page-shell">
      <PageHeader
        title="읽기 보관함"
        description="검색으로 수집한 자료를 주제와 읽기 상태별로 다시 찾습니다."
        actions={<button type="button" className="button-secondary" aria-expanded={open} aria-controls="lib-manage" onClick={() => setOpen(value => !value)}>
          보관함 관리{managed ? ' · 조건 적용 중' : ''}
        </button>}
      />
      <LibraryBoard manageOpen={open} />
    </section>
  );
}
