import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";

import ExcelUploadPage from "./pages/ExcelUploadPage";
import WorkloadDataPage from "./pages/WorkloadDataPage";
import PlaceholdersPage from "./pages/PlaceholdersPage";
import DocxUploadPage from "./pages/DocxUploadPage";
import SettingsPage from "./pages/SettingsPage";
import GeneratePage from "./pages/GeneratePage";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/excel-upload" replace />} />
        <Route path="/excel-upload" element={<ExcelUploadPage />} />
        <Route path="/workload-data" element={<WorkloadDataPage />} />
        <Route path="/placeholders" element={<PlaceholdersPage />} />
        <Route path="/docx-upload" element={<DocxUploadPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/generate" element={<GeneratePage />} />
      </Routes>
    </BrowserRouter>
  );
}
