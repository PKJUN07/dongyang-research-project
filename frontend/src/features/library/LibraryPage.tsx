import { DocumentsPanel } from '../documents/DocumentsPanel';
import { PageHeader } from "../../components/PageHeader";

export default function LibraryPage() {
  return (
    <section className="page-shell">
      <PageHeader
        eyebrow="READING LIBRARY"
        title="내 보관함"
        description="보관한 자료를 주제와 읽기 상태별로 다시 찾습니다."
      />
      <DocumentsPanel library />
    </section>
  );
}
