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
  const [docxTemplates, setDocxTemplates] = useState([]);

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);

  const excelForYear = useMemo(() => {
    return (excelTemplates || []).find((t) => String(t.academic_year) === String(academicYear)) || null;
  }, [excelTemplates, academicYear]);

  const docxForYear = useMemo(() => {
    return (docxTemplates || []).find((t) => String(t.academic_year) === String(academicYear)) || null;
  }, [docxTemplates, academicYear]);

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
      setStatus("");
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

    window.addEventListener("focus", refresh);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  async function handleUpload() {
    if (!departmentId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    if (!academicYear) {
      setStatus("Укажи год");
      return;
    }
    if (!excelForYear) {
      setStatus("Сначала загрузи Excel для этого года");
      return;
    }
    if (docxForYear) {
      setStatus("На этот год уже есть DOCX. Удали и загрузи заново.");
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
      form.append("file", file);

      await api.post("/docx/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

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

  async function deleteByYear(year) {
    const ok = window.confirm(`Удалить DOCX за ${year}?`);
    if (!ok) return;

    try {
      setStatus("Удаление...");
      await api.delete("/docx/by-year", { params: { department_id: departmentId, academic_year: year } });
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
          <button
            className="btn btn-primary"
            onClick={() => document.getElementById("docx-file").click()}
            disabled={uploading || !excelForYear || !!docxForYear}
          >
            Выбрать файл
          </button>

          <div className="small" style={{ marginTop: 10 }}>
            {file ? `Файл: ${file.name}` : "Файл не выбран"}
          </div>
        </div>

        <div className="actions-row">
          <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !excelForYear || !!docxForYear}>
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
              {docxTemplates.length === 0 ? (
                <tr>
                  <td colSpan={4}>Файлов пока нет</td>
                </tr>
              ) : (
                docxTemplates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.academic_year}</td>
                    <td>{t.source_filename || "template.docx"}</td>
                    <td>{fmtDateTime(t.created_at)}</td>
                    <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn btn-danger" onClick={() => deleteByYear(t.academic_year)}>
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
