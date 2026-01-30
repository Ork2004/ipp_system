import { useEffect, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function ExcelUploadPage() {
  const navigate = useNavigate();

  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 0));

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);
  }, []);

  async function handleUpload() {
    if (!departmentId) {
      setStatus("Нет department_id. Выйди и зайди заново (чтобы токен сохранил кафедру).");
      return;
    }
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

      const res = await api.post("/excel/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      localStorage.setItem("excel_template_id", String(res.data.excel_template_id));
      localStorage.setItem("academic_year", academicYear);

      setStatus(`Готово ✅ Excel загружен`);
      navigate("/settings");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки ❌");
    }
  }

  return (
    <div className="container">
      <div className="page-title">Загрузка Excel-файла нагрузки</div>

      <div className="card card-pad">
        <div className="section-title">Параметры</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            className="input"
            style={{ width: 200 }}
            value={academicYear}
            onChange={(e) => {
              setAcademicYear(e.target.value);
              localStorage.setItem("academic_year", e.target.value);
            }}
            placeholder="2025-2026"
          />
          <div className="small">{status}</div>
        </div>

        <div className="upload-box">
          <input
            type="file"
            accept=".xlsx,.xls"
            id="excel-file"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn btn-primary" onClick={() => document.getElementById("excel-file").click()}>
            Выберите Excel
          </button>

          <div className="small" style={{ marginTop: 10 }}>
            {file ? `Выбран: ${file.name}` : "Файл не выбран"}
          </div>
        </div>

        <div className="actions-row">
          <div className="small">Кафедра берётся автоматически из аккаунта.</div>
          <button className="btn btn-primary" onClick={handleUpload}>
            ЗАГРУЗИТЬ
          </button>
        </div>
      </div>
    </div>
  );
}
