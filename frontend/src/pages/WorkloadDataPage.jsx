import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const yearSelectStyle = {
  width: 220,
  height: 52,
  borderRadius: 14,
  border: "1px solid #d9e3f5",
  background: "#f8fbff",
  boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
  color: "#17356f",
  fontSize: 16,
  fontWeight: 700,
  padding: "0 16px",
  outline: "none",
  opacity: 1,
  WebkitTextFillColor: "#17356f",
};

const topLabelStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#5f7195",
  marginBottom: 8,
};

export default function WorkloadDataPage() {
  const [departmentId, setDepartmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );

  const [templates, setTemplates] = useState([]);
  const [selectedYear, setSelectedYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );

  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [status, setStatus] = useState("");

  const years = useMemo(() => {
    const set = new Set(
      (templates || []).map((t) => t.academic_year).filter(Boolean)
    );
    set.add(selectedYear);
    return Array.from(set).sort().reverse();
  }, [templates, selectedYear]);

  const templateForYear = useMemo(() => {
    return (
      (templates || []).find(
        (t) => String(t.academic_year) === String(selectedYear)
      ) || null
    );
  }, [templates, selectedYear]);

  async function loadTemplates(depId) {
    if (!depId) {
      setStatus("Нет department_id. Выйди и зайди заново.");
      return [];
    }

    try {
      setLoadingTemplates(true);
      const res = await api.get("/excel/templates", {
        params: { department_id: depId },
      });

      const list = Array.isArray(res.data) ? res.data : [];
      setTemplates(list);
      setStatus("");
      return list;
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки списка");
      setTemplates([]);
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

      const first = await api.get(`/excel/${templateId}/preview`, {
        params: { limit: 50, offset: 0 },
      });

      const hdrs = Array.isArray(first.data?.headers) ? first.data.headers : [];
      setHeaders(hdrs);

      const firstRows = Array.isArray(first.data?.rows) ? first.data.rows : [];
      let allRows = [...firstRows];

      const PAGE = 300;
      let offset = allRows.length;

      while (true) {
        const res = await api.get(`/excel/${templateId}/preview`, {
          params: { limit: PAGE, offset },
        });

        const chunk = Array.isArray(res.data?.rows) ? res.data.rows : [];
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
    const year = localStorage.getItem("academic_year") || "2025-2026";

    setDepartmentId(dep);
    setSelectedYear(year);

    (async () => {
      await loadTemplates(dep);
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem("academic_year", selectedYear);

    if (!templateForYear) {
      setHeaders([]);
      setRows([]);
      return;
    }

    loadPreviewAll(String(templateForYear.id));
  }, [selectedYear, templates]);

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
        Данные нагрузки
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
            gap: 18,
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={topLabelStyle}>Учебный год</div>
            <select
              className="input"
              style={yearSelectStyle}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              disabled={loadingTemplates}
            >
              {years.map((y) => (
                <option key={y} value={y} style={{ color: "#17356f" }}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div
            className="small"
            style={{
              color: status ? "#315fcb" : "#7c8aa5",
              fontWeight: 600,
              minHeight: 24,
              paddingBottom: 10,
            }}
          >
            {status}
          </div>
        </div>

        <div
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
              minWidth: 900,
              tableLayout: "auto",
              whiteSpace: "nowrap",
              margin: 0,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    width: 70,
                    minWidth: 70,
                    background: "#f7faff",
                    color: "#5f7195",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "18px 16px",
                  }}
                >
                  №
                </th>

                {headers.map((h) => (
                  <th
                    key={h}
                    style={{
                      minWidth: 160,
                      background: "#f7faff",
                      color: "#5f7195",
                      fontWeight: 800,
                      fontSize: 14,
                      padding: "18px 16px",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loadingPreview ? (
                <tr>
                  <td
                    colSpan={Math.max(1, headers.length + 1)}
                    style={{
                      textAlign: "center",
                      padding: "28px 16px",
                      color: "#7c8aa5",
                      fontWeight: 500,
                    }}
                  >
                    Загрузка...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(1, headers.length + 1)}
                    style={{
                      textAlign: "center",
                      padding: "28px 16px",
                      color: "#7c8aa5",
                      fontWeight: 500,
                    }}
                  >
                    Нет строк
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.row_number}>
                    <td
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        background: "#fff",
                        fontWeight: 700,
                        color: "#17356f",
                        width: 70,
                        minWidth: 70,
                        padding: "16px",
                      }}
                    >
                      {r.row_number}
                    </td>

                    {headers.map((h) => (
                      <td
                        key={h}
                        style={{
                          minWidth: 160,
                          padding: "16px",
                          color: "#1f2f4d",
                        }}
                      >
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