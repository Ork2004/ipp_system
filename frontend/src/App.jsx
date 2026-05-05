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

function RequireAuth({ children }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) return <Navigate to="/login" replace />;
  if (role !== "admin") return <Navigate to="/home" replace />;
  return children;
}

function RequireRoles({ roles, children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") || "guest";

  if (!token) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) return <Navigate to="/home" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<Navigate to="/home" replace />} />

        <Route
          path="/home"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />

        <Route
          path="/generate"
          element={
            <RequireRoles roles={["admin", "teacher"]}>
              <GeneratePage />
            </RequireRoles>
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
            <RequireRoles roles={["admin", "teacher"]}>
              <WorkloadDataPage />
            </RequireRoles>
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

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
