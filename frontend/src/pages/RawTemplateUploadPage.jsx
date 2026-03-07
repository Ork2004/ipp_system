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

export default function RawTemplateUploadPage() {
  const [departmentId, setDepartmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );

  const [templates, setTemplates] = useState([]);
  const [file, setFile] = useState(null);

  const [status, setStatus] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);

  const currentTemplate = useMemo(() => {
    return (
      (templates || []).find(
        (t) => String(t.academic_year) === String(academicYear)
      ) || null
    );
  }, [templates, academicYear]);

  async function loadTemplates(depId) {
    if (!depId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }

    setLoadingList(true);
    try {
      const res = await api.get("/raw-template/templates", {
        params: { department_id: depId },
      });
      setTemplates(Array.isArray(res.data) ? res.data : []);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки списка");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);
    if (dep) loadTemplates(dep);

    const refresh = () => {
      const d = Number(localStorage.getItem("department_id") || 0);
      if (d) loadTemplates(d);
    };

    window.addEventListener("focus", refresh);
    const onVis = () =>
      document.visibilityState === "visible" && refresh();
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
    if (currentTemplate) {
      setStatus("На этот год уже есть raw шаблон. Удали и загрузи заново.");
      return;
    }
    if (!file) {
      setStatus("Выберите файл .docx");
      return;
    }

    try {
      setUploading(true);
      setStatus("Загрузка и сканирование...");

      const form = new FormData();
      form.append("department_id", String(departmentId));
      form.append("academic_year", academicYear);
      form.append("file", file);

      const res = await api.post("/raw-template/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      localStorage.setItem("academic_year", academicYear);
      if (res.data?.raw_template_id) {
        localStorage.setItem("raw_template_id", String(res.data.raw_template_id));
      }

      setFile(null);
      setStatus(
        `Загружено ✅ Таблиц: ${res.data?.tables_count || 0}, ячеек: ${
          res.data?.cells_count || 0
        }`
      );

      await loadTemplates(departmentId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  async function deleteByYear(year) {
    const ok = window.confirm(`Удалить raw шаблон за ${year}?`);
    if (!ok) return;

    try {
      setStatus("Удаление...");
      await api.delete("/raw-template/by-year", {
        params: { department_id: departmentId, academic_year: year },
      });

      const savedYear = localStorage.getItem("academic_year");
      if (String(savedYear) === String(year)) {
        localStorage.removeItem("raw_template_id");
      }

      setStatus("Удалено");
      await loadTemplates(departmentId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка удаления");
    }
  }

  async function downloadByYear(year, filenameFromRow) {
    if (!departmentId) return;

    try {
      setStatus("Скачивание...");
      const res = await api.get("/raw-template/by-year/download", {
        params: { department_id: departmentId, academic_year: year },
        responseType: "blob",
      });

      const fname = filenameFromRow || `raw_template_${year}.docx`;
      downloadBlob(res.data, fname);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка скачивания");
    }
  }

  async function openTables(year) {
    try {
      setStatus("Загрузка таблиц...");
      const res = await api.get("/raw-template/by-year", {
        params: { department_id: departmentId, academic_year: year },
      });

      if (res.data?.id) {
        localStorage.setItem("raw_template_id", String(res.data.id));
        localStorage.setItem("academic_year", String(year));
        window.location.href = "/manual-tables";
      } else {
        setStatus("Не удалось открыть шаблон");
      }
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка открытия шаблона");
    }
  }

  return (
    <div className="container">
      <div className="page-title">Шаблон без плейсхолдеров</div>

      <div className="card card-pad">
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
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

          <div className="small">
            {loadingList ? "Загрузка списка..." : status}
          </div>
        </div>

        <div className="upload-box">
          <input
            type="file"
            accept=".docx"
            id="raw-template-file"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <button
            className="btn btn-primary"
            onClick={() =>
              document.getElementById("raw-template-file").click()
            }
            disabled={uploading || !!currentTemplate}
          >
            Выбрать файл
          </button>

          <div className="small" style={{ marginTop: 10 }}>
            {file ? `Файл: ${file.name}` : "Файл не выбран"}
          </div>
        </div>

        <div className="actions-row">
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={uploading || !!currentTemplate}
          >
            {uploading ? "Загрузка..." : "Загрузить"}
          </button>
        </div>

        <div className="hr" style={{ marginTop: 18 }} />

        <div className="section-title" style={{ marginTop: 14 }}>
          Загруженные raw шаблоны
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          Это DOCX без плейсхолдеров. После загрузки система сканирует таблицы.
        </div>

        <div className="table-wrap" style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 1120 }}>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Учебный год</th>
                <th>Файл</th>
                <th style={{ width: 120 }}>Таблиц</th>
                <th style={{ width: 140 }}>Статус</th>
                <th style={{ width: 220 }}>Загружен</th>
                <th style={{ width: 420 }}></th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={6}>Файлов пока нет</td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.academic_year}</td>
                    <td>{t.source_filename || "raw_template.docx"}</td>
                    <td>{t.tables_count ?? 0}</td>
                    <td>{t.status || ""}</td>
                    <td>{fmtDateTime(t.created_at)}</td>
                    <td
                      style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="btn btn-outline"
                        onClick={() => openTables(t.academic_year)}
                      >
                        Открыть таблицы
                      </button>

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