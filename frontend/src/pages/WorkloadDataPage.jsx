import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function WorkloadDataPage() {
  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 0));

  const [templates, setTemplates] = useState([]);
  const [selectedYear, setSelectedYear] = useState(localStorage.getItem("academic_year") || "2025-2026");

  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [status, setStatus] = useState("");

  const years = useMemo(() => {
    const set = new Set((templates || []).map((t) => t.academic_year).filter(Boolean));
    set.add(selectedYear);
    return Array.from(set).sort().reverse();
  }, [templates, selectedYear]);

  const templateForYear = useMemo(() => {
    return (templates || []).find((t) => String(t.academic_year) === String(selectedYear)) || null;
  }, [templates, selectedYear]);

  async function loadTemplates(depId) {
    if (!depId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return [];
    }
    try {
      setLoadingTemplates(true);
      const res = await api.get("/excel/templates", { params: { department_id: depId } });
      const list = res.data || [];
      setTemplates(list);
      setStatus("");
      return list;
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки списка");
      return [];
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function loadPreviewAll(templateId) {
    if (!templateId) return;

    try {
      setLoadingPreview(true);
      setStatus("Загрузка...");

      const first = await api.get(`/excel/${templateId}/preview`, { params: { limit: 50, offset: 0 } });
      const hdrs = first.data.headers || [];
      setHeaders(hdrs);

      const firstRows = first.data.rows || [];
      let allRows = [...firstRows];

      const PAGE = 300;
      let offset = allRows.length;

      while (true) {
        const res = await api.get(`/excel/${templateId}/preview`, { params: { limit: PAGE, offset } });
        const chunk = res.data.rows || [];
        if (!chunk.length) break;

        allRows = allRows.concat(chunk);
        offset += chunk.length;

        if (chunk.length < PAGE) break;
      }

      setRows(allRows);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки данных");
      setHeaders([]);
      setRows([]);
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);

    (async () => {
      await loadTemplates(dep);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("academic_year", selectedYear);

    if (!templateForYear) {
      setHeaders([]);
      setRows([]);
      return;
    }

    loadPreviewAll(String(templateForYear.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, templates]);

  return (
    <div className="container">
      <div className="page-title">Данные нагрузки</div>

      <div className="card card-pad">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <select
            className="input"
            style={{ width: 200 }}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            disabled={loadingTemplates}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <div className="small">{status}</div>
        </div>

        <div style={{ overflowX: "auto", borderRadius: 12 }}>
          <table className="table" style={{ minWidth: 900, tableLayout: "auto", whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 3, width: 70, minWidth: 70, background: "var(--bg, #fff)" }}>№</th>
                {headers.map((h) => (
                  <th key={h} style={{ minWidth: 160, background: "var(--bg, #fff)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loadingPreview ? (
                <tr>
                  <td colSpan={Math.max(1, headers.length + 1)}>Загрузка...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, headers.length + 1)}>Нет строк</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.row_number}>
                    <td style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg, #fff)", fontWeight: 700, width: 70, minWidth: 70 }}>
                      {r.row_number}
                    </td>
                    {headers.map((h) => (
                      <td key={h} style={{ minWidth: 160 }}>
                        {r.row_data?.[h] ?? ""}
                      </td>
                    ))}
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
