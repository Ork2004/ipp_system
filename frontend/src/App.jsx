import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";

import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ExcelUploadPage from "./pages/ExcelUploadPage";
import WorkloadDataPage from "./pages/WorkloadDataPage";
import SettingsPage from "./pages/SettingsPage";
import GeneratePage from "./pages/GeneratePage";
import RawTemplateUploadPage from "./pages/RawTemplateUploadPage";
import ManualTablesPage from "./pages/ManualTablesPage";
import Form63Page from "./pages/Form63Page";
import AnalysisPage from "./pages/AnalysisPage"; // ✅ ДОБАВИЛИ

import { getRole, getToken } from "./session";

/* ================= GUARDS ================= */

function RequireAuth({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

function RequireRoles({ roles, children }) {
  const token = getToken();
  const role = getRole();

  if (!token) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) return <Navigate to="/home" replace />;

  return children;
}

function RequireAdmin({ children }) {
  return <RequireRoles roles={["admin"]}>{children}</RequireRoles>;
}

/* ================= APP ================= */

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        {/* AUTH */}
        <Route path="/login" element={<LoginPage />} />

        {/* REDIRECT */}
        <Route path="/" element={<Navigate to="/home" replace />} />

        {/* HOME */}
        <Route
          path="/home"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />

        {/* GENERATE */}
        <Route
          path="/generate"
          element={
            <RequireRoles roles={["admin", "teacher"]}>
              <GeneratePage />
            </RequireRoles>
          }
        />

        {/* ADMIN ONLY */}
        <Route
          path="/excel-upload"
          element={
            <RequireAdmin>
              <ExcelUploadPage />
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

        <Route
          path="/raw-template-upload"
          element={
            <RequireAdmin>
              <RawTemplateUploadPage />
            </RequireAdmin>
          }
        />

        {/* SHARED */}
        <Route
          path="/workload-data"
          element={
            <RequireRoles roles={["admin", "teacher"]}>
              <WorkloadDataPage />
            </RequireRoles>
          }
        />

        <Route
          path="/manual-tables"
          element={
            <RequireRoles roles={["admin", "teacher"]}>
              <ManualTablesPage />
            </RequireRoles>
          }
        />

        <Route
          path="/form63"
          element={
            <RequireRoles roles={["admin", "teacher"]}>
              <Form63Page />
            </RequireRoles>
          }
        />

        {/* 🔥 NEW ANALYSIS PAGE */}
        <Route
          path="/analysis"
          element={
            <RequireRoles roles={["admin"]}>
              <AnalysisPage />
            </RequireRoles>
          }
        />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}