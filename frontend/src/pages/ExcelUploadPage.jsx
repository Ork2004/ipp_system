import { useEffect, useState } from "react";
import { api } from "../api";

function fmtDateTime(v) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

export default function ExcelUploadPage() {
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const [departmentId, setDepartmentId] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selectedExcelId = localStorage.getItem("excel_template_id");

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);
    if (dep) loadTemplates(dep);

    const refresh = () => {
      const d = Number(localStorage.getItem("department_id") || 0);
      if (d) loadTemplates(d);
    };

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  async function loadTemplates(depId) {
    setLoadingList(true);
    try {
      const r = await api.get("/excel/templates", { params: { department_id: depId } });
      setTemplates(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка загрузки списка");
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
      setStatus("Выберите файл .xlsx/.xls");
      return;
    }

    try {
      setUploading(true);
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

      setStatus("Загружено");
      setFile(null);

      await loadTemplates(departmentId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  function selectTemplate(id) {
    localStorage.setItem("excel_template_id", String(id));
    setStatus("Выбрано");
  }

  async function deleteTemplate(id) {
    const ok = window.confirm("Удалить выбранную нагрузку?");
    if (!ok) return;

    try {
      await api.delete(`/excel/${id}`);

      if (String(selectedExcelId) === String(id)) {
        localStorage.removeItem("excel_template_id");
      }

      setStatus("Удалено");
      await loadTemplates(departmentId);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка удаления");
    }
  }

  return (
    <div className="container">
      <div className="page-title">Нагрузка</div>

      <div className="card card-pad">
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
          <button className="btn btn-primary" onClick={() => document.getElementById("excel-file").click()} disabled={uploading}>
            Выбрать файл
          </button>

          <div className="small" style={{ marginTop: 10 }}>
            {file ? `Файл: ${file.name}` : "Файл не выбран"}
          </div>
        </div>

        <div className="actions-row">
          <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
            {uploading ? "Загрузка..." : "Загрузить"}
          </button>
        </div>

        <div className="hr" style={{ marginTop: 18 }} />

        <div className="section-title" style={{ marginTop: 14 }}>
          Загруженные файлы
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          {loadingList ? "Загрузка списка..." : ""}
        </div>

        <div className="table-wrap" style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Учебный год</th>
                <th>Файл</th>
                <th style={{ width: 220 }}>Загружен</th>
                <th style={{ width: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={4}>Файлов пока нет</td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.academic_year}</td>
                    <td>
                      {t.source_filename || "excel.xlsx"}
                      {String(selectedExcelId) === String(t.id) ? (
                        <span style={{ marginLeft: 8, fontWeight: 800 }}>(выбран)</span>
                      ) : null}
                    </td>
                    <td>{fmtDateTime(t.created_at)}</td>
                    <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn btn-outline" onClick={() => selectTemplate(t.id)}>
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
    </div>
  );
}
