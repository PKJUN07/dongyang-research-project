import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./AppLayout";
import SearchPage from "../features/search/SearchPage";
import LibraryPage from "../features/library/LibraryPage";
import { lazy, Suspense } from 'react';
const StatsPage = lazy(() => import('../features/stats/StatsPage'));
import DocumentDetailPage from "../features/documents/DocumentDetailPage";
import DocumentsPage from "../features/documents/DocumentsPage";
import BriefPage from '../features/documents/BriefPage';
import { EmptyState } from "../components/AsyncState";

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/search" replace />} />

        <Route path="/search" element={<SearchPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/stats" element={<Suspense fallback={<p role="status">통계 화면을 준비하고 있습니다…</p>}><StatsPage /></Suspense>} />

        <Route path="/documents/:documentId" element={<DocumentDetailPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/brief" element={<BriefPage />} />
        <Route
          path="*"
          element={
            <EmptyState
              title="페이지를 찾을 수 없습니다"
              description="왼쪽 메뉴에서 준비된 화면을 선택해 주세요."
            />
          }
        />
      </Route>
    </Routes>
  );
}
