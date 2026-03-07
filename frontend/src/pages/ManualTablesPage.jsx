import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function ManualTablesPage() {
  const [departmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );
  const [rawTemplateId, setRawTemplateId] = useState(
    Number(localStorage.getItem("raw_template_id") || 0)
  );

  const [tables, setTables] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingTypeId, setSavingTypeId] = useState(0);
  const [openTableIds, setOpenTableIds] = useState({});

  const groupedSections = useMemo(() => {
    const map = new Map();

    for (const table of tables) {
      const key = table.section_title || `Раздел ${table.table_index + 1}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(table);
    }

    return Array.from(map.entries()).map(([sectionTitle, items]) => ({
      sectionTitle,
      items,
    }));
  }, [tables]);

  async function resolveRawTemplateIdByYear(year) {
    if (!departmentId || !year) return 0;

    const res = await api.get("/raw-template/by-year", {
      params: {
        department_id: departmentId,
        academic_year: year,
      },
    });

    const id = Number(res.data?.id || 0);
    if (id) {
      localStorage.setItem("raw_template_id", String(id));
      setRawTemplateId(id);
    }
    return id;
  }

  async function loadTables(templateId) {
    if (!templateId) {
      setTables([]);
      setStatus("Нет raw_template_id");
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/raw-template/${templateId}/tables`);
      const list = Array.isArray(res.data?.tables) ? res.data.tables : [];
      setTables(list);

      const opened = {};
      list.forEach((t, idx) => {
        opened[t.id] = idx < 3;
      });
      setOpenTableIds(opened);

      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки таблиц");
      setTables([]);
    } finally {
      setLoading(false);
    }
  }

  async function reloadCurrent() {
    try {
      setStatus("Загрузка...");
      let id = Number(localStorage.getItem("raw_template_id") || 0);

      if (!id) {
        id = await resolveRawTemplateIdByYear(academicYear);
      }

      if (!id) {
        setStatus("Raw шаблон для этого года не найден");
        setTables([]);
        return;
      }

      setRawTemplateId(id);
      await loadTables(id);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
      setTables([]);
    }
  }

  useEffect(() => {
    reloadCurrent();

    const refresh = () => {
      setAcademicYear(localStorage.getItem("academic_year") || "2025-2026");
      setRawTemplateId(Number(localStorage.getItem("raw_template_id") || 0));
      reloadCurrent();
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

  async function handleChangeYear(nextYear) {
    setAcademicYear(nextYear);
    localStorage.setItem("academic_year", nextYear);
    localStorage.removeItem("raw_template_id");
    setRawTemplateId(0);

    try {
      setStatus("Поиск шаблона...");
      const id = await resolveRawTemplateIdByYear(nextYear);
      if (!id) {
        setTables([]);
        setStatus("Raw шаблон для этого года не найден");
        return;
      }
      await loadTables(id);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка переключения года");
    }
  }

  async function updateTableType(rawTableId, nextType) {
    try {
      setSavingTypeId(rawTableId);
      setStatus("Сохранение типа таблицы...");

      await api.patch(`/raw-template/table/${rawTableId}/type`, {
        table_type: nextType,
      });

      setTables((prev) =>
        prev.map((t) =>
          t.id === rawTableId ? { ...t, table_type: nextType } : t
        )
      );

      setStatus("Тип таблицы сохранен ✅");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка сохранения типа");
    } finally {
      setSavingTypeId(0);
    }
  }

  function toggleOpen(tableId) {
    setOpenTableIds((prev) => ({
      ...prev,
      [tableId]: !prev[tableId],
    }));
  }

  return (
    <div className="container">
      <div className="page-title">Заполнение таблиц шаблона</div>

      <div className="card card-pad">
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <input
            className="input"
            style={{ width: 200 }}
            value={academicYear}
            onChange={(e) => handleChangeYear(e.target.value)}
            placeholder="2025-2026"
          />

          <div className="small">
            raw_template_id: {rawTemplateId || "—"} | department_id:{" "}
            {departmentId || "—"}
          </div>

          <div className="small">{loading ? "Загрузка..." : status}</div>
        </div>

        <div className="hr" />

        {!tables.length && !loading ? (
          <div className="small" style={{ padding: "8px 0" }}>
            Нет таблиц. Сначала загрузи raw шаблон на странице “Шаблон без
            плейсхолдеров”.
          </div>
        ) : null}

        {groupedSections.map((section) => (
          <div key={section.sectionTitle} style={{ marginTop: 18 }}>
            <div className="section-title">{section.sectionTitle}</div>

            {section.items.map((table) => (
              <div
                className="card"
                key={table.id}
                style={{
                  marginTop: 12,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(15,23,42,.10)",
                }}
              >
                <div
                  style={{
                    padding: 14,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    background: "#f8fbff",
                    borderBottom: "1px solid rgba(15,23,42,.08)",
                  }}
                >
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 800 }}>
                      Таблица #{table.table_index + 1}
                    </div>
                    <div className="small">
                      {table.row_count} строк • {table.col_count} колонок •
                      editable: {table.editable_cells_count} • filled:{" "}
                      {table.prefilled_cells_count}
                    </div>
                    <div className="small">
                      {table.has_total_row ? "Есть строка Итого" : "Без строки Итого"}
                      {table.loop_template_row_index !== null &&
                      table.loop_template_row_index !== undefined
                        ? ` • loop row: ${table.loop_template_row_index + 1}`
                        : ""}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <select
                      className="input"
                      style={{ width: 160 }}
                      value={table.table_type || "static"}
                      onChange={(e) =>
                        updateTableType(table.id, e.target.value)
                      }
                      disabled={savingTypeId === table.id}
                    >
                      <option value="static">static</option>
                      <option value="loop">loop</option>
                    </select>

                    <button
                      className="btn btn-outline"
                      onClick={() => toggleOpen(table.id)}
                    >
                      {openTableIds[table.id] ? "Скрыть" : "Открыть"}
                    </button>
                  </div>
                </div>

                {openTableIds[table.id] ? (
                  <div style={{ padding: 14 }}>
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <div className="small">
                        <b>Тип:</b> {table.table_type || "static"}
                      </div>
                      <div className="small">
                        <b>Header signature:</b>{" "}
                        <span
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          }}
                        >
                          {table.header_signature || "—"}
                        </span>
                      </div>
                      <div className="small">
                        <b>Подсказки колонок:</b>{" "}
                        {(table.column_hints || []).join(" | ") || "—"}
                      </div>
                    </div>

                    <RawTableGrid table={table} />

                    {table.table_type === "loop" ? (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 12,
                          background: "rgba(47,107,255,.06)",
                          border: "1px solid rgba(47,107,255,.12)",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                          Loop-таблица
                        </div>
                        <div className="small">
                          Сейчас эта страница уже умеет:
                          определять и менять тип таблицы.
                          Сохранение пользовательских значений и добавление новых
                          строк мы сделаем следующим backend/API шагом.
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RawTableGrid({ table }) {
  const matrix = Array.isArray(table.matrix) ? table.matrix : [];

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        className="table"
        style={{
          minWidth: Math.max(760, (table.col_count || 1) * 160),
          tableLayout: "fixed",
        }}
      >
        <tbody>
          {matrix.length === 0 ? (
            <tr>
              <td>Нет данных</td>
            </tr>
          ) : (
            matrix.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell) => (
                  <td
                    key={cell.cell_key}
                    style={{
                      verticalAlign: "top",
                      background: cell.editable
                        ? "rgba(34,197,94,.06)"
                        : "#fff",
                      borderTop: "1px solid rgba(15,23,42,.06)",
                      minWidth: 160,
                    }}
                  >
                    {cell.editable ? (
                      <input
                        className="input"
                        value=""
                        readOnly
                        placeholder="пустая ячейка"
                        style={{
                          background: "#fff",
                          borderColor: "rgba(34,197,94,.30)",
                        }}
                      />
                    ) : (
                      <div style={{ whiteSpace: "pre-wrap" }}>
                        {cell.text || ""}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "#64748b",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      }}
                    >
                      r{cell.row_index + 1}:c{cell.col_index + 1}
                    </div>
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}