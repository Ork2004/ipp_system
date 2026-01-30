import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function WorkloadDataPage() {
  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 0));

  const [templates, setTemplates] = useState([]);
  const [selectedYear, setSelectedYear] = useState(localStorage.getItem("academic_year") || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(localStorage.getItem("excel_template_id") || "");

  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [status, setStatus] = useState("");

  const years = useMemo(() => {
    const set = new Set(templates.map((t) => t.academic_year).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [templates]);

  const templatesForYear = useMemo(() => {
    if (!selectedYear) return templates;
    return templates.filter((t) => t.academic_year === selectedYear);
  }, [templates, selectedYear]);

  async function loadTemplates() {
    if (!departmentId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    try {
      setLoadingTemplates(true);
      const res = await api.get(`/excel/templates`, { params: { department_id: departmentId } });
      setTemplates(res.data || []);

      if (!selectedYear && (res.data || []).length) {
        const y = res.data[0].academic_year;
        setSelectedYear(y);
        localStorage.setItem("academic_year", y);
      }
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки списка Excel");
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function loadPreview(templateId) {
    if (!templateId) return;
    try {
      setLoadingPreview(true);
      setStatus("Загрузка предпросмотра...");
      const res = await api.get(`/excel/${templateId}/preview`, { params: { limit: 30, offset: 0 } });
      setHeaders(res.data.headers || []);
      setRows(res.data.rows || []);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка предпросмотра Excel");
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    setDepartmentId(Number(localStorage.getItem("department_id") || 0));
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!templates.length) return;
    const list = templatesForYear;

    if (!list.length) {
      setSelectedTemplateId("");
      setHeaders([]);
      setRows([]);
      localStorage.removeItem("excel_template_id");
      return;
    }

    const exists = list.some((t) => String(t.id) === String(selectedTemplateId));
    if (!exists) {
      const firstId = String(list[0].id);
      setSelectedTemplateId(firstId);
      localStorage.setItem("excel_template_id", firstId);
    }
  }, [selectedYear, templates]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    localStorage.setItem("excel_template_id", String(selectedTemplateId));
    loadPreview(selectedTemplateId);
  }, [selectedTemplateId]);

  return (
    <div className="container">
      <div className="page-title">Данные Excel (предпросмотр)</div>

      <div className="card card-pad">
        <div className="section-title">Выбор</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <select
            className="input"
            style={{ width: 200 }}
            value={selectedYear}
            onChange={(e) => {
              const y = e.target.value;
              setSelectedYear(y);
              localStorage.setItem("academic_year", y);
            }}
            disabled={loadingTemplates}
          >
            <option value="">{loadingTemplates ? "Загрузка..." : "Выберите год"}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={{ width: 460 }}
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            disabled={loadingTemplates || !templatesForYear.length}
          >
            {!templatesForYear.length ? (
              <option value="">Нет загруженных Excel</option>
            ) : (
              templatesForYear.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.source_filename || "excel.xlsx"} {t.is_active ? "(active)" : ""}
                </option>
              ))
            )}
          </select>

          <button className="btn btn-outline" onClick={loadTemplates}>
            Обновить
          </button>

          <div className="small">{status}</div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>№</th>
                {headers.slice(0, 6).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingPreview ? (
                <tr>
                  <td colSpan={7}>Загрузка строк...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>Нет строк</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.row_number}>
                    <td>{r.row_number}</td>
                    {headers.slice(0, 6).map((h) => (
                      <td key={h}>{r.row_data?.[h] ?? ""}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Показаны первые 6 колонок и первые 30 строк.
        </div>
      </div>
    </div>
  );
}
