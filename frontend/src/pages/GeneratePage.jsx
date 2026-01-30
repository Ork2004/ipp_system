import { useState } from "react";
import { api } from "../api";

export default function GeneratePage() {
  const [teacherId, setTeacherId] = useState(Number(localStorage.getItem("teacher_id") || 1));
  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 1));
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");
  const [docxTemplateId, setDocxTemplateId] = useState(localStorage.getItem("docx_template_id") || "");

  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

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
      setDownloadUrl(res.data.download_url);
    } catch (e) {
      console.error(e);
      setStatus(`Ошибка ❌ ${e?.response?.data?.detail || "проверь настройки/шаблоны"}`);
    }
  }

  return (
    <div className="container">
      <div className="page-title">Генерация DOCX</div>

      <div className="card card-pad">
        <div className="section-title">Параметры</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input className="input" style={{ width: 140 }} value={teacherId} onChange={(e) => setTeacherId(Number(e.target.value || 1))} placeholder="teacher_id" />
          <input className="input" style={{ width: 140 }} value={departmentId} onChange={(e) => setDepartmentId(Number(e.target.value || 1))} placeholder="department_id" />
          <input className="input" style={{ width: 160 }} value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2025-2026" />
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
          <br />4) Settings → <b>Сохранить</b>
        </div>

        <div className="actions-row">
          <button className="btn btn-primary" onClick={generate}>СГЕНЕРИРОВАТЬ</button>
        </div>

        {downloadUrl ? (
          <div style={{ marginTop: 14 }}>
            <div className="small">Скачать результат:</div>
            <a href={`http://localhost:8000${downloadUrl}`} target="_blank" rel="noreferrer">
              Download DOCX
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
