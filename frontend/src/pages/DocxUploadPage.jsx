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
  const [selectedExcelId, setSelectedExcelId] = useState(localStorage.getItem("excel_template_id") || "");

  const [docxTemplates, setDocxTemplates] = useState([]);

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [compat, setCompat] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);

  const selectedDocxId = localStorage.getItem("docx_template_id") || "";

  const years = useMemo(() => {
    const set = new Set((excelTemplates || []).map((t) => t.academic_year).filter(Boolean));
    set.add(academicYear);
    return Array.from(set).sort().reverse();
  }, [excelTemplates, academicYear]);

  const templatesForYear = useMemo(() => {
    if (!academicYear) return excelTemplates;
    return (excelTemplates || []).filter((t) => t.academic_year === academicYear);
  }, [excelTemplates, academicYear]);

  async function loadExcelTemplates(depId) {
    const res = await api.get("/excel/templates", { params: { department_id: depId } });
    setExcelTemplates(res.data || []);
  }

  async function loadDocxTemplates(depId) {
    const res = await api.get("/docx/templates", { params: { department_id: depId } });
    setDocxTemplates(res.data || []);
  }

  async function refreshAll() {
    if (!departmentId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    setLoadingLists(true);
    try {
      await Promise.all([loadExcelTemplates(departmentId), loadDocxTemplates(departmentId)]);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка загрузки списков");
    } finally {
      setLoadingLists(false);
    }
  }

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);
    (async () => {
      try {
        if (dep) {
          setLoadingLists(true);
          await Promise.all([loadExcelTemplates(dep), loadDocxTemplates(dep)]);
        } else {
          setStatus("Нет department_id. Выйди и зайди заново.");
        }
      } catch (e) {
        setStatus(e?.response?.data?.detail || "Ошибка загрузки данных");
      } finally {
        setLoadingLists(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!templatesForYear.length) return;
    const exists = templatesForYear.some((t) => String(t.id) === String(selectedExcelId));
    if (!exists) {
      const firstId = String(templatesForYear[0].id);
      setSelectedExcelId(firstId);
      localStorage.setItem("excel_template_id", firstId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYear, excelTemplates]);

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
      setFile(null);

      await loadDocxTemplates(departmentId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки DOCX ❌");
    } finally {
      setLoading(false);
    }
  }

  function selectDocx(id, excelId, year) {
    localStorage.setItem("docx_template_id", String(id));
    if (excelId) localStorage.setItem("excel_template_id", String(excelId));
    if (year) localStorage.setItem("academic_year", String(year));

    setStatus(`Выбран DOCX шаблон #${id}`);
  }

  async function deleteDocx(id) {
    const ok = window.confirm(`Удалить DOCX шаблон #${id}?`);
    if (!ok) return;

    try {
      await api.delete(`/docx/${id}`);

      if (String(selectedDocxId) === String(id)) {
        localStorage.removeItem("docx_template_id");
      }

      setStatus("DOCX удалён ✅");
      await loadDocxTemplates(departmentId);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка удаления DOCX ❌");
    }
  }

  return (
    <div className="container">
      <div className="page-title">Загрузка DOCX (шаблон ИПП)</div>

      <div className="card card-pad">
        <div className="section-title">Учебный год и Excel</div>

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
                  #{t.id} — {t.source_filename || "excel.xlsx"} {t.is_active ? "(active)" : ""}
                </option>
              ))
            )}
          </select>

          <div className="small">{loadingLists ? "Загрузка..." : status}</div>
        </div>

        <div className="small" style={{ marginBottom: 12 }}>
          Последовательность: <b>сначала Настройка</b> (плейсхолдеры/blocks), потом <b>DOCX</b>.
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
                <div className="small" style={{ fontWeight: 800 }}>Ошибки:</div>
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

      {/* СПИСОК DOCX */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="section-title">Загруженные DOCX</div>
          <button className="btn" onClick={refreshAll} disabled={loadingLists}>
            Обновить список
          </button>
        </div>

        <table style={{ width: "100%", marginTop: 12 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Имя файла</th>
              <th>Учебный год</th>
              <th>Дата/время</th>
              <th>Excel</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docxTemplates.length === 0 ? (
              <tr>
                <td colSpan={6} className="small">Файлов пока нет</td>
              </tr>
            ) : (
              docxTemplates.map((t) => (
                <tr key={t.id}>
                  <td>#{t.id}</td>
                  <td>
                    {t.source_filename || "template.docx"}
                    {String(selectedDocxId) === String(t.id) ? <span style={{ marginLeft: 6 }}>✅</span> : null}
                    {t.is_active ? <span className="small" style={{ marginLeft: 8 }}>(active)</span> : null}
                  </td>
                  <td>{t.academic_year}</td>
                  <td>{fmtDateTime(t.created_at)}</td>
                  <td>{t.excel_template_id ? `#${t.excel_template_id}` : "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => selectDocx(t.id, t.excel_template_id, t.academic_year)}>
                      Выбрать
                    </button>
                    <button className="btn btn-danger" onClick={() => deleteDocx(t.id)}>
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
  );
}
