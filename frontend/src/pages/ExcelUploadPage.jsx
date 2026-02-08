import { useEffect, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

function fmtDateTime(v) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

export default function ExcelUploadPage() {
  const navigate = useNavigate();

  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const [departmentId, setDepartmentId] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  const selectedExcelId = localStorage.getItem("excel_template_id");

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);
    if (dep) {
      loadTemplates(dep);
    }
  }, []);

  async function loadTemplates(depId) {
    setLoadingList(true);
    try {
      const r = await api.get("/excel/templates", {
        params: { department_id: depId },
      });
      setTemplates(Array.isArray(r.data) ? r.data : []);
    } finally {
      setLoadingList(false);
    }
  }

  async function handleUpload() {
    if (!departmentId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
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

      setStatus("Готово ✅ Excel загружен");
      setFile(null);
      await loadTemplates(departmentId);

      navigate("/settings");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки ❌");
    }
  }

  function selectTemplate(id) {
    localStorage.setItem("excel_template_id", String(id));
    setStatus(`Выбран Excel шаблон #${id}`);
    navigate("/settings");
  }

  async function deleteTemplate(id) {
    const ok = window.confirm(`Удалить Excel шаблон #${id}?`);
    if (!ok) return;

    try {
      await api.delete(`/excel/${id}`);

      if (String(selectedExcelId) === String(id)) {
        localStorage.removeItem("excel_template_id");
      }

      setStatus("Excel удалён ✅");
      await loadTemplates(departmentId);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка удаления ❌");
    }
  }

  return (
    <div className="container">
      <div className="page-title">Загрузка Excel-файла нагрузки</div>

      {/* ЗАГРУЗКА */}
      <div className="card card-pad">
        <div className="section-title">Учебный год</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
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

      {/* СПИСОК ФАЙЛОВ */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="section-title">Загруженные Excel</div>
          <button className="btn" onClick={() => loadTemplates(departmentId)} disabled={loadingList}>
            Обновить
          </button>
        </div>

        <table style={{ width: "100%", marginTop: 12 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Файл</th>
              <th>Учебный год</th>
              <th>Загружен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={5} className="small">Файлов пока нет</td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id}>
                  <td>#{t.id}</td>
                  <td>
                    {t.source_filename}
                    {String(selectedExcelId) === String(t.id) && (
                      <span style={{ marginLeft: 6 }}>✅</span>
                    )}
                  </td>
                  <td>{t.academic_year}</td>
                  <td>{fmtDateTime(t.created_at)}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => selectTemplate(t.id)}>
                      Выбрать
                    </button>
                    <button className="btn btn-danger" onClick={() => deleteTemplate(t.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
