import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";

import LoginPage from "./pages/LoginPage";
import ExcelUploadPage from "./pages/ExcelUploadPage";
import WorkloadDataPage from "./pages/WorkloadDataPage";
import DocxUploadPage from "./pages/DocxUploadPage";
import SettingsPage from "./pages/SettingsPage";
import GeneratePage from "./pages/GeneratePage";

function RequireAuth({ children }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) return <Navigate to="/login" replace />;
  if (role !== "admin") return <Navigate to="/generate" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<Navigate to="/generate" replace />} />

        <Route
          path="/generate"
          element={
            <RequireAuth>
              <GeneratePage />
            </RequireAuth>
          }
        />

        <Route
          path="/excel-upload"
          element={
            <RequireAdmin>
              <ExcelUploadPage />
            </RequireAdmin>
          }
        />

        <Route
          path="/workload-data"
          element={
            <RequireAdmin>
              <WorkloadDataPage />
            </RequireAdmin>
          }
        />

        <Route
          path="/docx-upload"
          element={
            <RequireAdmin>
              <DocxUploadPage />
            </RequireAdmin>
          }
        />

        <Route
          path="/settings"
          element={
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<Navigate to="/generate" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
