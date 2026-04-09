import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";

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
            <RequireAdmin>
              <ManualTablesPage />
            </RequireAdmin>
          }
        />


        <Route
          path="/form63"
          element={
            <RequireAdmin>
              <Form63Page />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<Navigate to="/generate" replace />} />
      </Routes>
    </BrowserRouter>
  );
}