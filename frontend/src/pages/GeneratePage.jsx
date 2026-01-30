import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function GeneratePage() {
  const role = useMemo(() => localStorage.getItem("role") || "guest", []);

  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 0));
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");

  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState(Number(localStorage.getItem("teacher_id") || 0));

  const [docxTemplates, setDocxTemplates] = useState([]);
  const [docxTemplateId, setDocxTemplateId] = useState(localStorage.getItem("docx_template_id") || "");

  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const [hist, setHist] = useState([]);
  const [histStatus, setHistStatus] = useState("");

  async function loadTeachers() {
    if (role !== "admin") return;
    try {
      const res = await api.get("/teachers", { params: { department_id: departmentId } });
      setTeachers(res.data || []);
      if (!teacherId && (res.data || []).length) {
        const first = res.data[0].id;
        setTeacherId(Number(first));
        localStorage.setItem("teacher_id", String(first));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadDocxTemplates() {
    if (!departmentId) return;
    try {
      const res = await api.get("/docx/templates", { params: { department_id: departmentId } });
      const list = res.data || [];
      setDocxTemplates(list);

      if (!docxTemplateId && list.length) {
        const active = list.find((x) => x.is_active) || list[0];
        setDocxTemplateId(String(active.id));
        localStorage.setItem("docx_template_id", String(active.id));
      }
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
    return `http://localhost:8000/generate/download?path=${encodeURIComponent(outputPath)}`;
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
    if (!docxTemplateId) {
      setStatus("Выбери DOCX шаблон");
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
        teacher_id: role === "admin" ? teacherId : Number(localStorage.getItem("teacher_id") || 0),
        department_id: departmentId,
        academic_year: academicYear,
        docx_template_id: Number(docxTemplateId),
      });

      setStatus("Готово ✅");
      setDownloadUrl(res.data.download_url || "");

      await loadHistory();
    } catch (e) {
      console.error(e);
      setStatus(`Ошибка ❌ ${e?.response?.data?.detail || "проверь настройки/шаблоны"}`);
      await loadHistory();
    }
  }

  useEffect(() => {
    setDepartmentId(Number(localStorage.getItem("department_id") || 0));
    setTeacherId(Number(localStorage.getItem("teacher_id") || 0));
    setDocxTemplateId(localStorage.getItem("docx_template_id") || "");
    loadDocxTemplates();
    loadTeachers();
    loadHistory();
  }, []);

  useEffect(() => {
    if (role === "admin") loadHistory();
  }, [teacherId]);

  return (
    <div className="container">
      <div className="page-title">Генерация ИПП</div>

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

          <select
            className="input"
            style={{ width: 520 }}
            value={docxTemplateId}
            onChange={(e) => {
              const v = e.target.value;
              setDocxTemplateId(v);
              localStorage.setItem("docx_template_id", v);
            }}
          >
            {!docxTemplates.length ? (
              <option value="">Нет DOCX шаблонов</option>
            ) : (
              docxTemplates.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.source_filename || "template.docx"} — {t.academic_year || ""} {t.is_active ? "(active)" : ""}
                </option>
              ))
            )}
          </select>

          {role === "admin" ? (
            <select
              className="input"
              style={{ width: 420 }}
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

          <div className="small">{status}</div>
        </div>

        <div className="actions-row">
          <button className="btn btn-primary" onClick={generate}>
            СГЕНЕРИРОВАТЬ
          </button>
          <button className="btn btn-outline" onClick={loadHistory}>
            Обновить историю
          </button>
        </div>

        {downloadUrl ? (
          <div style={{ marginTop: 14 }}>
            <div className="small">Скачать результат:</div>
            <a href={`http://localhost:8000${downloadUrl}`} target="_blank" rel="noreferrer">
              Download DOCX
            </a>
          </div>
        ) : null}

        <div className="hr" style={{ marginTop: 18 }} />

        <div className="section-title" style={{ marginTop: 14 }}>
          История генерации
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          {histStatus}
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th style={{ width: 200 }}>Дата</th>
                <th style={{ width: 110 }}>Статус</th>
                <th>Файл</th>
                <th style={{ width: 160 }}>Кто</th>
                <th style={{ width: 160 }}>Скачать</th>
              </tr>
            </thead>
            <tbody>
              {!hist.length ? (
                <tr>
                  <td colSpan="6">Пока нет записей</td>
                </tr>
              ) : (
                hist.map((h) => {
                  const link = h.output_path ? makeDownloadLinkFromPath(h.output_path) : "";
                  return (
                    <tr key={h.id}>
                      <td>{h.id}</td>
                      <td>{h.created_at ? String(h.created_at) : ""}</td>
                      <td style={{ fontWeight: 800 }}>{h.status}</td>
                      <td>{h.file_name || ""}</td>
                      <td>{h.generated_by_role ? `${h.generated_by_role} #${h.generated_by_user_id || ""}` : ""}</td>
                      <td>
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer">
                            Download
                          </a>
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
