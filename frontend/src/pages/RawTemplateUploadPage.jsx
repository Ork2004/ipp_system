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

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);
    if (dep) loadTemplates(dep);

    const refresh = () => {
      const d = Number(localStorage.getItem("department_id") || 0);
      if (d) loadTemplates(d);
    };

    window.addEventListener("focus", refresh);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

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
      setStatus("На этот год уже есть шаблон. Удали и загрузи заново.");
      return;
    }
    if (!file) {
      setStatus("Выберите файл .docx");
      return;
    }

    try {
      setUploading(true);
      setStatus("Загрузка и анализ шаблона...");

      const form = new FormData();
      form.append("department_id", String(departmentId));
      form.append("academic_year", academicYear);
      form.append("file", file);

      const res = await api.post("/raw-template/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      localStorage.setItem("academic_year", academicYear);
      if (res.data?.raw_template_id) {
        localStorage.setItem(
          "raw_template_id",
          String(res.data.raw_template_id)
        );
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
    const ok = window.confirm(`Удалить шаблон за ${year}?`);
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
    <div
      className="container"
      style={{
        maxWidth: 1280,
        paddingTop: 28,
        paddingBottom: 40,
      }}
    >
      <div
        className="page-title"
        style={{
          fontSize: 52,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          marginBottom: 24,
          color: "#17356f",
        }}
      >
        Шаблон
      </div>

      <div
        className="card card-pad"
        style={{
          borderRadius: 28,
          padding: 24,
          background: "rgba(255,255,255,0.94)",
          border: "1px solid rgba(30,58,138,0.08)",
          boxShadow: "0 16px 50px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <input
            className="input"
            style={{
              width: 220,
              height: 48,
              borderRadius: 14,
              border: "1px solid #d9e3f5",
              background: "#f8fbff",
              boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
            }}
            value={academicYear}
            onChange={(e) => {
              const y = e.target.value;
              setAcademicYear(y);
              localStorage.setItem("academic_year", y);
            }}
            placeholder="2025-2026"
          />

          <div
            className="small"
            style={{
              color: status ? "#315fcb" : "#7c8aa5",
              fontWeight: 500,
            }}
          >
            {loadingList ? "Загрузка списка..." : status}
          </div>
        </div>

        <div
          className="upload-box"
          style={{
            minHeight: 220,
            borderRadius: 24,
            border: "2px dashed #b8cdfd",
            background:
              "linear-gradient(180deg, rgba(58,110,255,0.07) 0%, rgba(58,110,255,0.03) 100%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "28px 20px",
            marginBottom: 18,
          }}
        >
          <input
            type="file"
            accept=".docx"
            id="raw-template-file"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <button
            className="btn btn-primary"
            onClick={() => document.getElementById("raw-template-file").click()}
            disabled={uploading || !!currentTemplate}
            style={{
              minWidth: 170,
              height: 50,
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 16,
              boxShadow: "0 12px 28px rgba(58,110,255,0.22)",
            }}
          >
            Выбрать файл
          </button>

          <div
            className="small"
            style={{
              marginTop: 14,
              fontSize: 15,
              color: file ? "#17356f" : "#7c8aa5",
              fontWeight: file ? 600 : 500,
            }}
          >
            {file ? `Файл: ${file.name}` : "Файл не выбран"}
          </div>
        </div>

        <div
          className="actions-row"
          style={{
            marginBottom: 20,
          }}
        >
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={uploading || !!currentTemplate}
            style={{
              minWidth: 150,
              height: 46,
              borderRadius: 14,
              fontWeight: 700,
              boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
            }}
          >
            {uploading ? "Загрузка..." : "Загрузить"}
          </button>
        </div>

        <div
          className="hr"
          style={{
            marginTop: 6,
            marginBottom: 18,
            opacity: 0.7,
          }}
        />

        <div
          className="section-title"
          style={{
            marginTop: 0,
            marginBottom: 10,
            fontSize: 32,
            fontWeight: 800,
            color: "#17356f",
            letterSpacing: "-0.02em",
          }}
        >
          Загруженные шаблоны
        </div>

        <div
          className="small"
          style={{
            marginBottom: 14,
            color: "#7c8aa5",
            minHeight: 20,
          }}
        >
          {loadingList ? "Загрузка списка..." : ""}
        </div>

        <div
          className="table-wrap"
          style={{
            overflowX: "auto",
            borderRadius: 20,
            border: "1px solid #e4ebf7",
            background: "#fff",
          }}
        >
          <table
            className="table"
            style={{
              minWidth: 1180,
              margin: 0,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    width: 160,
                    background: "#f7faff",
                    color: "#5f7195",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "18px 16px",
                  }}
                >
                  Учебный год
                </th>
                <th
                  style={{
                    background: "#f7faff",
                    color: "#5f7195",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "18px 16px",
                  }}
                >
                  Файл
                </th>
                <th
                  style={{
                    width: 110,
                    background: "#f7faff",
                    color: "#5f7195",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "18px 16px",
                  }}
                >
                  Таблиц
                </th>
                <th
                  style={{
                    width: 140,
                    background: "#f7faff",
                    color: "#5f7195",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "18px 16px",
                  }}
                >
                  Статус
                </th>
                <th
                  style={{
                    width: 220,
                    background: "#f7faff",
                    color: "#5f7195",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "18px 16px",
                  }}
                >
                  Загружен
                </th>
                <th
                  style={{
                    width: 420,
                    background: "#f7faff",
                    padding: "18px 16px",
                  }}
                />
              </tr>
            </thead>

            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: "28px 16px",
                      color: "#7c8aa5",
                      fontWeight: 500,
                    }}
                  >
                    Файлов пока нет
                  </td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id}>
                    <td
                      style={{
                        padding: "18px 16px",
                        fontWeight: 600,
                        color: "#17356f",
                      }}
                    >
                      {t.academic_year}
                    </td>

                    <td
                      style={{
                        padding: "18px 16px",
                        color: "#1f2f4d",
                        fontWeight: 500,
                      }}
                    >
                      {t.source_filename || "template.docx"}
                    </td>

                    <td
                      style={{
                        padding: "18px 16px",
                        color: "#556987",
                        fontWeight: 600,
                      }}
                    >
                      {t.tables_count ?? 0}
                    </td>

                    <td
                      style={{
                        padding: "18px 16px",
                        color: "#556987",
                      }}
                    >
                      {t.status || ""}
                    </td>

                    <td
                      style={{
                        padding: "18px 16px",
                        color: "#556987",
                      }}
                    >
                      {fmtDateTime(t.created_at)}
                    </td>

                    <td
                      style={{
                        padding: "14px 16px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          justifyContent: "flex-end",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          className="btn btn-outline"
                          onClick={() => openTables(t.academic_year)}
                          style={{
                            borderRadius: 12,
                            minWidth: 160,
                            height: 42,
                            fontWeight: 700,
                            border: "1px solid #d6e2fb",
                            background: "#fff",
                          }}
                        >
                          Открыть таблицы
                        </button>

                        <button
                          className="btn btn-outline"
                          onClick={() =>
                            downloadByYear(t.academic_year, t.source_filename)
                          }
                          style={{
                            borderRadius: 12,
                            minWidth: 110,
                            height: 42,
                            fontWeight: 700,
                            border: "1px solid #d6e2fb",
                            background: "#fff",
                          }}
                        >
                          Скачать
                        </button>

                        <button
                          className="btn btn-danger"
                          onClick={() => deleteByYear(t.academic_year)}
                          style={{
                            borderRadius: 12,
                            minWidth: 110,
                            height: 42,
                            fontWeight: 700,
                            boxShadow: "none",
                          }}
                        >
                          Удалить
                        </button>
                      </div>
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