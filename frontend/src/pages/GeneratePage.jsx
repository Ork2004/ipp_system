import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function GeneratePage() {
  const [teacherId, setTeacherId] = useState(Number(localStorage.getItem("teacher_id") || 1));
  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 1));
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");
  const [docxTemplateId, setDocxTemplateId] = useState(localStorage.getItem("docx_template_id") || "");

  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const [hist, setHist] = useState([]);
  const [histStatus, setHistStatus] = useState("");
  const [limit] = useState(50);
  const [offset] = useState(0);

  const role = useMemo(() => localStorage.getItem("role") || "guest", []);

  async function loadHistory() {
    try {
      setHistStatus("Загрузка истории...");
      const params = { limit, offset };

      if (role === "admin") {
        if (teacherId) params.teacher_id = Number(teacherId);
      }

      const res = await api.get("/history", { params });
      setHist(Array.isArray(res.data) ? res.data : []);
      setHistStatus("");
    } catch (e) {
      console.error(e);
      setHistStatus(e?.response?.data?.detail || "Ошибка загрузки истории");
    }
  }

  function makeDownloadLinkFromPath(outputPath) {
    if (!outputPath) return "";
    return `http://localhost:8000/generate/download?path=${encodeURIComponent(outputPath)}`;
  }

  async function generate() {
    try {
      setStatus("Генерация...");
      setDownloadUrl("");

      const res = await api.post("/generate/teacher", {
        teacher_id: teacherId,
        department_id: departmentId,
        academic_year: academicYear,
        docx_template_id: docxTemplateId ? Number(docxTemplateId) : null,
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
    loadHistory();
  }, []);

  return (
    <div className="container">
      <div className="page-title">Генерация DOCX</div>

      <div className="card card-pad">
        <div className="section-title">Параметры</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            className="input"
            style={{ width: 140 }}
            value={teacherId}
            onChange={(e) => setTeacherId(Number(e.target.value || 1))}
            placeholder="teacher_id"
          />
          <input
            className="input"
            style={{ width: 140 }}
            value={departmentId}
            onChange={(e) => setDepartmentId(Number(e.target.value || 1))}
            placeholder="department_id"
          />
          <input
            className="input"
            style={{ width: 160 }}
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2025-2026"
          />
          <input
            className="input"
            style={{ width: 220 }}
            value={docxTemplateId}
            onChange={(e) => {
              setDocxTemplateId(e.target.value);
              localStorage.setItem("docx_template_id", e.target.value);
            }}
            placeholder="docx_template_id"
          />
          <div className="small">{status}</div>
        </div>

        <div className="small" style={{ marginBottom: 12 }}>
          Перед генерацией:
          <br />1) Excel Upload
          <br />2) Settings: вставь <b>teacher.*</b>, <b>row.*</b>, <b>blocks (loops)</b> в DOCX
          <br />3) DOCX Upload
          <br />4) Settings → <b>Сохранить</b> → потом <b>Generate</b>
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
          {role === "admin"
            ? "Админ: история по выбранному teacher_id (если указан), иначе по кафедре."
            : "Преподаватель: только твоя история."}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <div className="small">{histStatus}</div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th style={{ width: 190 }}>Дата</th>
                <th style={{ width: 110 }}>Статус</th>
                <th>Файл</th>
                <th style={{ width: 160 }}>Кто</th>
                <th style={{ width: 160 }}>Для (teacher_id)</th>
                <th style={{ width: 160 }}>Скачать</th>
              </tr>
            </thead>
            <tbody>
              {!hist.length ? (
                <tr>
                  <td colSpan="7">Пока нет записей</td>
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
                      <td>{h.generated_for_teacher_id ?? ""}</td>
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
