import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function DocxUploadPage() {
  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 0));
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");

  const [excelTemplates, setExcelTemplates] = useState([]);
  const [selectedExcelId, setSelectedExcelId] = useState(localStorage.getItem("excel_template_id") || "");

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [compat, setCompat] = useState(null);
  const [loading, setLoading] = useState(false);

  const years = useMemo(() => {
    const set = new Set((excelTemplates || []).map((t) => t.academic_year).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [excelTemplates]);

  const templatesForYear = useMemo(() => {
    if (!academicYear) return excelTemplates;
    return (excelTemplates || []).filter((t) => t.academic_year === academicYear);
  }, [excelTemplates, academicYear]);

  async function loadExcelTemplates() {
    if (!departmentId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    try {
      const res = await api.get("/excel/templates", { params: { department_id: departmentId } });
      setExcelTemplates(res.data || []);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки Excel шаблонов");
    }
  }

  useEffect(() => {
    setDepartmentId(Number(localStorage.getItem("department_id") || 0));
    loadExcelTemplates();
  }, []);

  useEffect(() => {
    if (!templatesForYear.length) return;
    const exists = templatesForYear.some((t) => String(t.id) === String(selectedExcelId));
    if (!exists) {
      const firstId = String(templatesForYear[0].id);
      setSelectedExcelId(firstId);
      localStorage.setItem("excel_template_id", firstId);
      localStorage.setItem("academic_year", templatesForYear[0].academic_year || academicYear);
    }
  }, [excelTemplates, academicYear]);

  async function handleUpload() {
    if (!departmentId) {
      setStatus("Нет department_id");
      return;
    }
    if (!selectedExcelId) {
      setStatus("Сначала выбери Excel шаблон");
      return;
    }
    if (!file) {
      setStatus("Выберите DOCX файл (.docx)");
      return;
    }

    try {
      setLoading(true);
      setStatus("Загрузка...");
      setCompat(null);

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

      setStatus("Готово ✅ DOCX загружен");
      setCompat(res.data.compatibility || null);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки DOCX ❌");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="page-title">Загрузка DOCX (шаблон ИПП)</div>

      <div className="card card-pad">
        <div className="section-title">Выбор года и Excel</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <select
            className="input"
            style={{ width: 200 }}
            value={academicYear}
            onChange={(e) => {
              const y = e.target.value;
              setAcademicYear(y);
              localStorage.setItem("academic_year", y);
            }}
          >
            {years.length ? null : <option value={academicYear}>{academicYear}</option>}
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={{ width: 520 }}
            value={selectedExcelId}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedExcelId(v);
              localStorage.setItem("excel_template_id", v);
            }}
          >
            {!templatesForYear.length ? (
              <option value="">Нет Excel для выбранного года</option>
            ) : (
              templatesForYear.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.source_filename || "excel.xlsx"} {t.is_active ? "(active)" : ""}
                </option>
              ))
            )}
          </select>

          <button className="btn btn-outline" onClick={loadExcelTemplates}>
            Обновить
          </button>

          <div className="small">{status}</div>
        </div>

        <div className="small" style={{ marginBottom: 12 }}>
          Вставляй плейсхолдеры и blocks только из страницы <b>Настройка</b>.
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
          <div className="small">DOCX будет связан с выбранным Excel.</div>
          <button className="btn btn-primary" onClick={handleUpload} disabled={loading}>
            {loading ? "Загрузка..." : "ЗАГРУЗИТЬ DOCX"}
          </button>
        </div>

        {compat ? (
          <div style={{ marginTop: 16 }}>
            <div className="section-title">Проверка совместимости</div>

            <div className="small">
              ok: <b>{String(compat.ok)}</b>
            </div>

            {(compat.errors || []).length ? (
              <div style={{ marginTop: 10 }}>
                <div className="small" style={{ fontWeight: 800 }}>
                  Ошибки:
                </div>
                <ul className="small">
                  {(compat.errors || []).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {compat.missing_row_placeholders?.length ? (
              <div style={{ marginTop: 10 }}>
                <div className="small" style={{ fontWeight: 800 }}>
                  ❌ В DOCX есть row.* которых нет в Excel:
                </div>
                <ul className="small">
                  {compat.missing_row_placeholders.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {compat.unknown_loops?.length ? (
              <div style={{ marginTop: 10 }}>
                <div className="small" style={{ fontWeight: 800 }}>
                  ❌ В DOCX есть blocks, которых нет среди доступных:
                </div>
                <ul className="small">
                  {compat.unknown_loops.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
