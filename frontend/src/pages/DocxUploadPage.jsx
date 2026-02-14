import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

function fmtDateTime(v) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

export default function DocxUploadPage() {
  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 0));
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");

  const [excelTemplates, setExcelTemplates] = useState([]);
  const [selectedExcelId, setSelectedExcelId] = useState(localStorage.getItem("excel_template_id") || "");

  const [docxTemplates, setDocxTemplates] = useState([]);

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selectedDocxId = localStorage.getItem("docx_template_id") || "";

  const excelForYear = useMemo(() => {
    if (!academicYear) return excelTemplates;
    return (excelTemplates || []).filter((t) => t.academic_year === academicYear);
  }, [excelTemplates, academicYear]);

  function excelNameById(id) {
    const ex = (excelTemplates || []).find((x) => String(x.id) === String(id));
    return ex?.source_filename || "—";
  }

  async function loadExcelTemplates(depId) {
    const res = await api.get("/excel/templates", { params: { department_id: depId } });
    setExcelTemplates(res.data || []);
  }

  async function loadDocxTemplates(depId) {
    const res = await api.get("/docx/templates", { params: { department_id: depId } });
    setDocxTemplates(res.data || []);
  }

  async function loadAll(depId) {
    if (!depId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    setLoadingList(true);
    try {
      await Promise.all([loadExcelTemplates(depId), loadDocxTemplates(depId)]);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка загрузки списка");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);
    if (dep) loadAll(dep);

    const refresh = () => {
      const d = Number(localStorage.getItem("department_id") || 0);
      if (d) loadAll(d);
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

  async function handleUpload() {
    if (!departmentId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    if (!selectedExcelId) {
      setStatus("Сначала выбери Excel");
      return;
    }
    if (!file) {
      setStatus("Выберите файл .docx");
      return;
    }

    try {
      setUploading(true);
      setStatus("Загрузка...");

      const form = new FormData();
      form.append("department_id", String(departmentId));
      form.append("academic_year", academicYear);
      form.append("excel_template_id", String(selectedExcelId));
      form.append("file", file);

      const res = await api.post("/docx/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      localStorage.setItem("docx_template_id", String(res.data.docx_template_id));
      localStorage.setItem("excel_template_id", String(selectedExcelId));
      localStorage.setItem("academic_year", academicYear);

      setStatus("Загружено");
      setFile(null);

      await loadDocxTemplates(departmentId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  function selectDocx(id, excelId, year) {
    localStorage.setItem("docx_template_id", String(id));
    if (excelId) localStorage.setItem("excel_template_id", String(excelId));
    if (year) localStorage.setItem("academic_year", String(year));
    setStatus("Выбрано");
  }

  async function deleteDocx(id) {
    const ok = window.confirm("Удалить выбранный шаблон?");
    if (!ok) return;

    try {
      await api.delete(`/docx/${id}`);

      if (String(selectedDocxId) === String(id)) {
        localStorage.removeItem("docx_template_id");
      }

      setStatus("Удалено");
      await loadDocxTemplates(departmentId);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка удаления");
    }
  }

  return (
    <div className="container">
      <div className="page-title">Шаблон ИПП</div>

      <div className="card card-pad">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <input
            className="input"
            style={{ width: 200 }}
            value={academicYear}
            onChange={(e) => {
              const y = e.target.value;
              setAcademicYear(y);
              localStorage.setItem("academic_year", y);
            }}
            placeholder="2025-2026"
          />

          <select
            className="input"
            style={{ width: 520 }}
            value={selectedExcelId}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedExcelId(v);
              localStorage.setItem("excel_template_id", v);
            }}
            disabled={loadingList}
          >
            {!excelForYear.length ? (
              <option value="">Нет Excel</option>
            ) : (
              excelForYear.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.source_filename || "excel.xlsx"}
                </option>
              ))
            )}
          </select>

          <div className="small">{loadingList ? "Загрузка..." : status}</div>
        </div>

        <div className="upload-box">
          <input
            type="file"
            accept=".docx"
            id="docx-file"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn btn-primary" onClick={() => document.getElementById("docx-file").click()} disabled={uploading}>
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
          <table className="table" style={{ minWidth: 1050 }}>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Учебный год</th>
                <th>Файл</th>
                <th style={{ width: 220 }}>Загружен</th>
                <th style={{ width: 260 }}>Excel</th>
                <th style={{ width: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {docxTemplates.length === 0 ? (
                <tr>
                  <td colSpan={5}>Файлов пока нет</td>
                </tr>
              ) : (
                docxTemplates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.academic_year}</td>
                    <td>
                      {t.source_filename || "template.docx"}
                      {String(selectedDocxId) === String(t.id) ? (
                        <span style={{ marginLeft: 8, fontWeight: 800 }}>(выбран)</span>
                      ) : null}
                    </td>
                    <td>{fmtDateTime(t.created_at)}</td>
                    <td>{t.excel_template_id ? excelNameById(t.excel_template_id) : "—"}</td>
                    <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn btn-outline" onClick={() => selectDocx(t.id, t.excel_template_id, t.academic_year)}>
                        Выбрать
                      </button>
                      <button className="btn btn-danger" onClick={() => deleteDocx(t.id)}>
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
