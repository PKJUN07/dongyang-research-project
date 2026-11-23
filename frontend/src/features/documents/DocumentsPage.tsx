import { PageHeader } from '../../components/PageHeader';
import { DocumentsPanel } from './DocumentsPanel';
export default function DocumentsPage() {
  return <section className="page-shell"><PageHeader eyebrow="SAVED DOCUMENTS" title="전체 수집 자료" description="검색으로 수집한 자료 전체입니다. 다시 읽을 자료는 내 보관함에 담아두세요." /><DocumentsPanel /></section>;
}
