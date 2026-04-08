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

export default function GeneratePage() {
  const role = useMemo(() => localStorage.getItem("role") || "guest", []);

  const [departmentId, setDepartmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );

  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState(
    Number(localStorage.getItem("teacher_id") || 0)
  );

  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const [hist, setHist] = useState([]);
  const [histStatus, setHistStatus] = useState("");

  const [excelTemplates, setExcelTemplates] = useState([]);
  const [docxTemplates, setDocxTemplates] = useState([]);

  const years = useMemo(() => {
    const set = new Set();
    (excelTemplates || []).forEach(
      (t) => t.academic_year && set.add(t.academic_year)
    );
    (docxTemplates || []).forEach(
      (t) => t.academic_year && set.add(t.academic_year)
    );
    set.add(academicYear);
    return Array.from(set).sort().reverse();
  }, [excelTemplates, docxTemplates, academicYear]);

  const hasExcel = useMemo(() => {
    return (excelTemplates || []).some(
      (t) => String(t.academic_year) === String(academicYear)
    );
  }, [excelTemplates, academicYear]);

  const hasDocx = useMemo(() => {
    return (docxTemplates || []).some(
      (t) => String(t.academic_year) === String(academicYear)
    );
  }, [docxTemplates, academicYear]);

  async function loadTeachers() {
    if (role !== "admin") return;
    try {
      const res = await api.get("/teachers", {
        params: { department_id: departmentId },
      });
      const list = res.data || [];
      setTeachers(list);

      if (!teacherId && list.length) {
        const first = list[0].id;
        setTeacherId(Number(first));
        localStorage.setItem("teacher_id", String(first));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadYearLists() {
    if (!departmentId) return;
    try {
      const [ex, dx] = await Promise.all([
        api.get("/excel/templates", { params: { department_id: departmentId } }),
        api.get("/docx/templates", { params: { department_id: departmentId } }),
      ]);
      setExcelTemplates(ex.data || []);
      setDocxTemplates(dx.data || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadHistory() {
    try {
      setHistStatus("Загрузка истории...");
      const params = { limit: 50, offset: 0 };
      if (role === "admin" && teacherId) params.teacher_id = Number(teacherId);
      const res = await api.get("/history", { params });
      setHist(Array.isArray(res.data) ? res.data : []);
      setHistStatus("");
    } catch (e) {
      console.error(e);
      setHistStatus(e?.response?.data?.detail || "Ошибка истории");
    }
  }

  function makeDownloadLinkFromPath(outputPath) {
    if (!outputPath) return "";
    return `http://localhost:8000/generate/download?path=${encodeURIComponent(
      outputPath
    )}`;
  }

  async function generate() {
    if (!departmentId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    if (!academicYear) {
      setStatus("Выбери год");
      return;
    }
    if (!hasExcel) {
      setStatus("Нет Excel для этого года");
      return;
    }
    if (!hasDocx) {
      setStatus("Нет DOCX для этого года");
      return;
    }
    if (role === "admin" && !teacherId) {
      setStatus("Выбери преподавателя");
      return;
    }

    try {
      setStatus("Генерация...");
      setDownloadUrl("");

      const res = await api.post("/generate/teacher", {
        teacher_id:
          role === "admin"
            ? teacherId
            : Number(localStorage.getItem("teacher_id") || 0),
        department_id: departmentId,
        academic_year: academicYear,
      });

      setStatus("Готово ✅");
      setDownloadUrl(res.data.download_url || "");

      await loadHistory();
    } catch (e) {
      console.error(e);
      setStatus(
        `Ошибка ❌ ${e?.response?.data?.detail || "проверь настройки/шаблоны"}`
      );
      await loadHistory();
    }
  }

  useEffect(() => {
    setDepartmentId(Number(localStorage.getItem("department_id") || 0));
    setTeacherId(Number(localStorage.getItem("teacher_id") || 0));

    loadYearLists();
    loadTeachers();
    loadHistory();

    const refresh = () => {
      loadYearLists();
      loadTeachers();
      loadHistory();
    };

    window.addEventListener("focus", refresh);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role === "admin") loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

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
        Генерация ИПП
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
          <select
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
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {role === "admin" ? (
            <select
              className="input"
              style={{
                width: 420,
                height: 48,
                borderRadius: 14,
                border: "1px solid #d9e3f5",
                background: "#f8fbff",
                boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
              }}
              value={teacherId ? String(teacherId) : ""}
              onChange={(e) => {
                const v = Number(e.target.value || 0);
                setTeacherId(v);
                localStorage.setItem("teacher_id", String(v));
              }}
            >
              {!teachers.length ? (
                <option value="">Нет преподавателей</option>
              ) : (
                teachers.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.full_name}
                  </option>
                ))
              )}
            </select>
          ) : null}

          <div
            className="small"
            style={{
              color: status ? "#315fcb" : "#7c8aa5",
              fontWeight: 500,
            }}
          >
            {status}
          </div>
        </div>

        <div
          className="actions-row"
          style={{
            marginBottom: 10,
          }}
        >
          <button
            className="btn btn-primary"
            onClick={generate}
            disabled={!hasExcel || !hasDocx}
            style={{
              minWidth: 200,
              height: 48,
              borderRadius: 14,
              fontWeight: 800,
              letterSpacing: "0.02em",
              boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
            }}
          >
            СГЕНЕРИРОВАТЬ
          </button>
        </div>

        {downloadUrl ? (
          <div style={{ marginTop: 14, marginBottom: 10 }}>
            <button
              className="btn btn-outline"
              onClick={() =>
                window.open(`http://localhost:8000${downloadUrl}`, "_blank", "noreferrer")
              }
              style={{
                borderRadius: 12,
                minWidth: 180,
                height: 44,
                fontWeight: 700,
                border: "1px solid #d6e2fb",
                background: "#fff",
              }}
            >
              Скачать результат
            </button>
          </div>
        ) : null}

        <div
          className="hr"
          style={{
            marginTop: 14,
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
          История генерации
        </div>

        <div
          className="small"
          style={{
            marginBottom: 14,
            color: "#7c8aa5",
            minHeight: 20,
          }}
        >
          {histStatus}
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
              minWidth: 980,
              margin: 0,
            }}
          >
            <thead>
              <tr>
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
                  Статус
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
                    width: 220,
                    background: "#f7faff",
                    color: "#5f7195",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "18px 16px",
                  }}
                >
                  Дата
                </th>
                <th
                  style={{
                    width: 180,
                    background: "#f7faff",
                    color: "#5f7195",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "18px 16px",
                  }}
                >
                  Кто
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
                  Скачать
                </th>
              </tr>
            </thead>

            <tbody>
              {!hist.length ? (
                <tr>
                  <td
                    colSpan="5"
                    style={{
                      textAlign: "center",
                      padding: "28px 16px",
                      color: "#7c8aa5",
                      fontWeight: 500,
                    }}
                  >
                    Пока нет записей
                  </td>
                </tr>
              ) : (
                hist.map((h) => {
                  const link = h.output_path
                    ? makeDownloadLinkFromPath(h.output_path)
                    : "";

                  return (
                    <tr key={h.id}>
                      <td
                        style={{
                          padding: "18px 16px",
                          fontWeight: 800,
                          color:
                            h.status?.toLowerCase().includes("ok") ||
                            h.status?.toLowerCase().includes("done") ||
                            h.status?.toLowerCase().includes("success")
                              ? "#1f8f57"
                              : "#17356f",
                        }}
                      >
                        {h.status}
                      </td>

                      <td
                        style={{
                          padding: "18px 16px",
                          color: "#1f2f4d",
                          fontWeight: 500,
                        }}
                      >
                        {h.file_name || ""}
                      </td>

                      <td
                        style={{
                          padding: "18px 16px",
                          color: "#556987",
                        }}
                      >
                        {fmtDateTime(h.created_at)}
                      </td>

                      <td
                        style={{
                          padding: "18px 16px",
                          color: "#556987",
                          fontWeight: 500,
                        }}
                      >
                        {h.generated_by_role
                          ? `${h.generated_by_role} #${h.generated_by_user_id || ""}`
                          : ""}
                      </td>

                      <td
                        style={{
                          padding: "14px 16px",
                        }}
                      >
                        {link ? (
                          <button
                            className="btn btn-outline"
                            onClick={() =>
                              window.open(link, "_blank", "noreferrer")
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
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}