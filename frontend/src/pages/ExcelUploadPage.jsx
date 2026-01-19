import { useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function ExcelUploadPage() {
  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 1));
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  async function handleUpload() {
    if (!file) {
      setStatus("Выберите Excel файл (.xlsx)");
      return;
    }

    try {
      setStatus("Загрузка...");
      const form = new FormData();
      form.append("department_id", String(departmentId));
      form.append("academic_year", academicYear);
      form.append("file", file);

      const res = await api.post("/upload/excel", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      localStorage.setItem("excel_template_id", String(res.data.excel_template_id));
      localStorage.setItem("academic_year", academicYear);
      localStorage.setItem("department_id", String(departmentId));

      setStatus(`Готово ✅ excel_template_id = ${res.data.excel_template_id}`);
      navigate("/placeholders");
    } catch (e) {
      setStatus("Ошибка загрузки ❌ (проверь backend и формат файла)");
      console.error(e);
    }
  }

  return (
    <div className="container">
      <div className="page-title">Загрузка Excel-файла нагрузки</div>

      <div className="card card-pad">
        <div className="section-title">Загрузка файла</div>

        <div className="upload-box">
          <input
            type="file"
            accept=".xlsx,.xls"
            id="excel-file"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn btn-primary" onClick={() => document.getElementById("excel-file").click()}>
            Выберите файл
          </button>

          <div className="small" style={{ marginTop: 10 }}>
            {file ? `Выбран: ${file.name}` : "Файл не выбран"}
          </div>
        </div>

        <div className="actions-row">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ width: 140 }}
              value={departmentId}
              onChange={(e) => setDepartmentId(Number(e.target.value || 1))}
              placeholder="department_id"
            />
            <input
              className="input"
              style={{ width: 160 }}
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="2025-2026"
            />
            <div className="small">{status}</div>
          </div>

          <button className="btn btn-primary" onClick={handleUpload}>
            ЗАГРУЗИТЬ ФАЙЛ
          </button>
        </div>
      </div>
    </div>
  );
}
