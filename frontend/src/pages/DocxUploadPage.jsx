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

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function DocxUploadPage() {
  const [departmentId, setDepartmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );

  const [excelTemplates, setExcelTemplates] = useState([]);
  const [docxTemplates, setDocxTemplates] = useState([]);

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);

  const excelForYear = useMemo(() => {
    return (
      (excelTemplates || []).find(
        (t) => String(t.academic_year) === String(academicYear)
      ) || null
    );
  }, [excelTemplates, academicYear]);

  const docxForYear = useMemo(() => {
    return (
      (docxTemplates || []).find(
        (t) => String(t.academic_year) === String(academicYear)
      ) || null
    );
  }, [docxTemplates, academicYear]);

  async function loadAll(depId) {
    if (!depId) return;

    setLoadingList(true);
    try {
      const [ex, dx] = await Promise.all([
        api.get("/excel/templates", { params: { department_id: depId } }),
        api.get("/docx/templates", { params: { department_id: depId } }),
      ]);
      setExcelTemplates(ex.data || []);
      setDocxTemplates(dx.data || []);
      setStatus("");
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);
    if (dep) loadAll(dep);
  }, []);

  async function handleUpload() {
    if (!departmentId) return setStatus("Нет department_id");
    if (!excelForYear) return setStatus("Сначала загрузи Excel");
    if (docxForYear) return setStatus("DOCX уже есть");
    if (!file) return setStatus("Выберите файл");

    try {
      setUploading(true);
      setStatus("Загрузка...");

      const form = new FormData();
      form.append("department_id", String(departmentId));
      form.append("academic_year", academicYear);
      form.append("file", file);

      await api.post("/docx/upload", form);

      setStatus("Загружено");
      setFile(null);
      await loadAll(departmentId);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка");
    } finally {
      setUploading(false);
    }
  }

  async function deleteByYear(year) {
    if (!window.confirm(`Удалить DOCX ${year}?`)) return;

    await api.delete("/docx/by-year", {
      params: { department_id: departmentId, academic_year: year },
    });

    await loadAll(departmentId);
  }

  async function downloadByYear(year, filename) {
    const res = await api.get("/docx/by-year/download", {
      params: { department_id: departmentId, academic_year: year },
      responseType: "blob",
    });

    downloadBlob(res.data, filename || "file.docx");
  }

  return (
    <div
      className="container"
      style={{ maxWidth: 1280, paddingTop: 28, paddingBottom: 40 }}
    >
      <div
        className="page-title"
        style={{
          fontSize: 52,
          fontWeight: 800,
          marginBottom: 24,
          color: "#17356f",
        }}
      >
        Шаблон ИПП
      </div>

      <div
        className="card card-pad"
        style={{
          borderRadius: 28,
          padding: 24,
          background: "rgba(255,255,255,0.94)",
          boxShadow: "0 16px 50px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <input
            className="input"
            style={{
              width: 220,
              height: 48,
              borderRadius: 14,
              background: "#f8fbff",
            }}
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />

          <div className="small">{status}</div>
        </div>

        <div
          className="upload-box"
          style={{
            borderRadius: 24,
            border: "2px dashed #b8cdfd",
            padding: 30,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
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
            style={{
              height: 48,
              borderRadius: 14,
              fontWeight: 700,
            }}
          >
            Выбрать файл
          </button>

          <div style={{ marginTop: 10 }}>
            {file ? file.name : "Файл не выбран"}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={uploading || !excelForYear || !!docxForYear}
          style={{
            height: 46,
            borderRadius: 14,
            marginBottom: 20,
          }}
        >
          {uploading ? "Загрузка..." : "Загрузить"}
        </button>

        <div className="hr" style={{ marginBottom: 18 }} />

        <div
          className="section-title"
          style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}
        >
          Загруженные файлы
        </div>

        <div style={{ marginBottom: 10 }}>
          {loadingList ? "Загрузка..." : ""}
        </div>

        <div style={{ borderRadius: 16, overflow: "hidden" }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Год</th>
                <th>Файл</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docxTemplates.length === 0 ? (
                <tr>
                  <td colSpan={4}>Нет файлов</td>
                </tr>
              ) : (
                docxTemplates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.academic_year}</td>
                    <td>{t.source_filename}</td>
                    <td>{fmtDateTime(t.created_at)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-outline"
                        onClick={() =>
                          downloadByYear(t.academic_year, t.source_filename)
                        }
                      >
                        Скачать
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => deleteByYear(t.academic_year)}
                      >
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