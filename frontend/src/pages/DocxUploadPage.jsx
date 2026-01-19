import { useState } from "react";
import { api } from "../api";

export default function DocxUploadPage() {
  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 1));
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");
  const [excelTemplateId, setExcelTemplateId] = useState(localStorage.getItem("excel_template_id") || "");

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [compat, setCompat] = useState(null);

  async function handleUpload() {
    if (!file) {
      setStatus("Выберите DOCX файл (.docx)");
      return;
    }
    if (!excelTemplateId) {
      setStatus("Нет excel_template_id (сначала загрузи Excel)");
      return;
    }

    try {
      setStatus("Загрузка...");
      setCompat(null);

      const form = new FormData();
      form.append("department_id", String(departmentId));
      form.append("academic_year", academicYear);
      form.append("excel_template_id", String(excelTemplateId));
      form.append("file", file);

      const res = await api.post("/docx/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      localStorage.setItem("docx_template_id", String(res.data.docx_template_id));
      setStatus(`Готово ✅ docx_template_id = ${res.data.docx_template_id}`);
      setCompat(res.data.compatibility || null);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки DOCX ❌");
    }
  }

  return (
    <div className="container">
      <div className="page-title">Загрузка DOCX (связка с Excel)</div>

      <div className="card card-pad">
        <div className="section-title">Параметры</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <input className="input" style={{ width: 140 }} value={departmentId} onChange={(e) => setDepartmentId(Number(e.target.value || 1))} />
          <input className="input" style={{ width: 160 }} value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          <input
            className="input"
            style={{ width: 220 }}
            value={excelTemplateId}
            onChange={(e) => {
              setExcelTemplateId(e.target.value);
              localStorage.setItem("excel_template_id", e.target.value);
            }}
            placeholder="excel_template_id"
          />
          <div className="small">{status}</div>
        </div>

        <div className="upload-box">
          <input
            type="file"
            accept=".docx"
            id="docx-file"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button className="btn btn-primary" onClick={() => document.getElementById("docx-file").click()}>
            Выберите DOCX
          </button>

          <div className="small" style={{ marginTop: 10 }}>
            {file ? `Выбран: ${file.name}` : "Файл не выбран"}
          </div>
        </div>

        <div className="actions-row" style={{ marginTop: 12 }}>
          <div className="small">
            DOCX будет привязан к текущему excel_template_id.
          </div>
          <button className="btn btn-primary" onClick={handleUpload}>
            ЗАГРУЗИТЬ DOCX
          </button>
        </div>

        {compat ? (
          <div style={{ marginTop: 16 }}>
            <div className="section-title">Проверка совместимости</div>
            <div className="small">
              ok: <b>{String(compat.ok)}</b>
            </div>

            {compat.missing_row_placeholders?.length ? (
              <div style={{ marginTop: 10 }}>
                <div className="small" style={{ fontWeight: 800 }}>❌ В DOCX есть row.* которых нет в Excel:</div>
                <ul className="small">
                  {compat.missing_row_placeholders.map(x => <li key={x}>{x}</li>)}
                </ul>
              </div>
            ) : null}

            <div style={{ marginTop: 10 }}>
              <div className="small" style={{ fontWeight: 800 }}>✅ Используемые row.* в DOCX:</div>
              <div className="small">{(compat.used_row_placeholders || []).length} шт.</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
