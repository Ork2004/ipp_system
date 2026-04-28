import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const fieldStyle = {
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

const teacherFieldStyle = {
  ...fieldStyle,
  width: 420,
};

const labelStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#5f7195",
  marginBottom: 8,
};

function makeTempLoopRowId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function ManualTablesPage() {
  const role = localStorage.getItem("role") || "guest";

  const [departmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );

  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );

  const [rawTemplateId, setRawTemplateId] = useState(
    Number(localStorage.getItem("raw_template_id") || 0)
  );

  const [teacherId, setTeacherId] = useState(
    Number(localStorage.getItem("teacher_id") || 0)
  );

  const [teachers, setTeachers] = useState([]);
  const [tables, setTables] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [savingStaticTableId, setSavingStaticTableId] = useState(0);
  const [openTableIds, setOpenTableIds] = useState({});
  const [formValues, setFormValues] = useState({});
  const [loopValues, setLoopValues] = useState({});
  const [tableLoopRows, setTableLoopRows] = useState({});
  const [savingLoopRowId, setSavingLoopRowId] = useState("");
  const [deletingLoopRowId, setDeletingLoopRowId] = useState("");
  const [addingLoopTableId, setAddingLoopTableId] = useState(0);

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

  async function loadTeachers(currentTeacherId = 0) {
    if (role !== "admin" || !departmentId) return;

    try {
      const res = await api.get("/teachers", {
        params: { department_id: departmentId },
      });

      const list = Array.isArray(res.data) ? res.data : [];
      setTeachers(list);

      if (!list.length) {
        setTeacherId(0);
        localStorage.removeItem("teacher_id");
        return;
      }

      const hasCurrent = list.some((t) => Number(t.id) === Number(currentTeacherId));

      if (hasCurrent) {
        setTeacherId(Number(currentTeacherId));
      } else {
        const firstId = Number(list[0].id);
        setTeacherId(firstId);
        localStorage.setItem("teacher_id", String(firstId));
      }
    } catch (e) {
      console.error(e);
      setTeachers([]);
    }
  }

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

  function buildInitialStateFromTables(list) {
    const nextFormValues = {};
    const nextLoopValues = {};
    const nextTableLoopRows = {};

    for (const table of list) {
      if (table.table_type === "static") {
        for (const item of table.editable_values || []) {
          nextFormValues[item.raw_cell_id] = item.value ?? "";
        }
      }

      if (table.table_type === "loop") {
        const rows = Array.isArray(table.loop_rows) ? table.loop_rows : [];

        nextTableLoopRows[table.id] = rows.map((row) => {
          const rowId = row.loop_row_id || makeTempLoopRowId();
          nextLoopValues[rowId] = {};

          for (const valueItem of row.values || []) {
            nextLoopValues[rowId][valueItem.col_index] = valueItem.value ?? "";
          }

          return {
            loop_row_id: rowId,
            persisted_loop_row_id: row.loop_row_id || null,
            row_order: row.row_order,
            isNew: !row.loop_row_id,
            isPrefilled: !!(row.values || []).some((v) => v.from_previous_year),
            values: row.values || [],
          };
        });
      }
    }

    setFormValues(nextFormValues);
    setLoopValues(nextLoopValues);
    setTableLoopRows(nextTableLoopRows);
  }

  function mergeOpenState(list) {
    setOpenTableIds((prev) => {
      const next = {};
      list.forEach((t, idx) => {
        if (Object.prototype.hasOwnProperty.call(prev, t.id)) {
          next[t.id] = prev[t.id];
        } else {
          next[t.id] = idx < 2;
        }
      });
      return next;
    });
  }

  async function loadForm(templateId, currentTeacherId) {
    if (!templateId) {
      setTables([]);
      setStatus("Шаблон не найден");
      return;
    }

    if (role === "admin" && !currentTeacherId) {
      setTables([]);
      setStatus("Выберите преподавателя");
      return;
    }

    setLoading(true);
    try {
      const params = {
        raw_template_id: templateId,
      };

      if (role === "admin") {
        params.teacher_id = currentTeacherId;
      }

      const res = await api.get("/manual-fill/form", { params });
      const list = Array.isArray(res.data?.tables) ? res.data.tables : [];

      setTables(list);
      buildInitialStateFromTables(list);
      mergeOpenState(list);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки таблиц");
      setTables([]);
      setFormValues({});
      setLoopValues({});
      setTableLoopRows({});
    } finally {
      setLoading(false);
    }
  }

  async function reloadCurrent(nextYear = academicYear, nextTeacherId = teacherId) {
    try {
      setStatus("Загрузка...");

      let id = Number(localStorage.getItem("raw_template_id") || 0);

      if (!id || String(localStorage.getItem("academic_year") || "") !== String(nextYear)) {
        id = await resolveRawTemplateIdByYear(nextYear);
      }

      if (!id) {
        setStatus("Шаблон для этого года не найден");
        setTables([]);
        return;
      }

      setRawTemplateId(id);
      await loadForm(id, nextTeacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
      setTables([]);
    }
  }

  useEffect(() => {
    const savedYear = localStorage.getItem("academic_year") || "2025-2026";
    const savedTemplateId = Number(localStorage.getItem("raw_template_id") || 0);
    const savedTeacherId = Number(localStorage.getItem("teacher_id") || 0);

    setAcademicYear(savedYear);
    setRawTemplateId(savedTemplateId);
    setTeacherId(savedTeacherId);

    loadTeachers(savedTeacherId);
    reloadCurrent(savedYear, savedTeacherId);

    const refresh = () => {
      const nextYear = localStorage.getItem("academic_year") || "2025-2026";
      const nextTemplateId = Number(localStorage.getItem("raw_template_id") || 0);
      const nextTeacherId = Number(localStorage.getItem("teacher_id") || 0);

      setAcademicYear(nextYear);
      setRawTemplateId(nextTemplateId);
      setTeacherId(nextTeacherId);

      loadTeachers(nextTeacherId);
      reloadCurrent(nextYear, nextTeacherId);
    };

    window.addEventListener("focus", refresh);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (role === "admin" && teacherId && rawTemplateId) {
      loadForm(rawTemplateId, teacherId);
    }
  }, [teacherId]);

  async function handleChangeYear(nextYear) {
    setAcademicYear(nextYear);
    localStorage.setItem("academic_year", nextYear);
    localStorage.removeItem("raw_template_id");
    setRawTemplateId(0);
    setOpenTableIds({});

    try {
      setStatus("Поиск шаблона...");
      const id = await resolveRawTemplateIdByYear(nextYear);

      if (!id) {
        setTables([]);
        setStatus("Шаблон для этого года не найден");
        return;
      }

      await loadForm(id, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка переключения года");
    }
  }

  function toggleOpen(tableId) {
    setOpenTableIds((prev) => ({
      ...prev,
      [tableId]: !prev[tableId],
    }));
  }

  function setStaticValue(rawCellId, value) {
    setFormValues((prev) => ({
      ...prev,
      [rawCellId]: value,
    }));
  }

  function getLoopRowValue(loopRowId, colIndex) {
    return loopValues?.[loopRowId]?.[colIndex] ?? "";
  }

  function setLoopRowValue(loopRowId, colIndex, value) {
    setLoopValues((prev) => ({
      ...prev,
      [loopRowId]: {
        ...(prev[loopRowId] || {}),
        [colIndex]: value,
      },
    }));
  }

  async function saveStaticTable(table) {
    try {
      setSavingStaticTableId(table.id);
      setStatus("Сохранение...");

      const values = (table.editable_values || []).map((item) => ({
        raw_cell_id: item.raw_cell_id,
        value: formValues[item.raw_cell_id] ?? "",
      }));

      await api.post("/manual-fill/save-static", {
        raw_template_id: rawTemplateId,
        teacher_id: role === "admin" ? teacherId : undefined,
        values,
      });

      setStatus("Сохранено");
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSavingStaticTableId(0);
    }
  }

  async function addLoopRow(table) {
    try {
      setAddingLoopTableId(table.id);

      const currentRows = Array.isArray(tableLoopRows[table.id])
        ? tableLoopRows[table.id]
        : [];

      const nextRowOrder =
        currentRows.length > 0
          ? Math.max(...currentRows.map((r) => Number(r.row_order) || 0)) + 1
          : 1;

      const tmpId = makeTempLoopRowId();

      setTableLoopRows((prev) => ({
        ...prev,
        [table.id]: [
          ...(prev[table.id] || []),
          {
            loop_row_id: tmpId,
            persisted_loop_row_id: null,
            row_order: nextRowOrder,
            isNew: true,
            isPrefilled: false,
            values: [],
          },
        ],
      }));

      setLoopValues((prev) => ({
        ...prev,
        [tmpId]: {},
      }));

      setStatus("Строка добавлена");
    } catch (e) {
      console.error(e);
      setStatus("Ошибка добавления строки");
    } finally {
      setAddingLoopTableId(0);
    }
  }

  async function ensurePersistedLoopRow(table, row) {
    if (row.persisted_loop_row_id) {
      return row.persisted_loop_row_id;
    }

    const res = await api.post("/manual-fill/add-loop-row", {
      raw_template_id: rawTemplateId,
      raw_table_id: table.id,
      teacher_id: role === "admin" ? teacherId : undefined,
    });

    const newLoopRowId = res.data?.loop_row_id;
    if (!newLoopRowId) {
      throw new Error("Не удалось создать строку на сервере");
    }

    const oldClientId = row.loop_row_id;

    setTableLoopRows((prev) => ({
      ...prev,
      [table.id]: (prev[table.id] || []).map((r) =>
        r.loop_row_id === oldClientId
          ? {
              ...r,
              persisted_loop_row_id: newLoopRowId,
              isNew: false,
            }
          : r
      ),
    }));

    setLoopValues((prev) => ({
      ...prev,
      [newLoopRowId]: prev[oldClientId] || {},
    }));

    return newLoopRowId;
  }

  async function saveLoopRow(row, table) {
    try {
      setSavingLoopRowId(String(row.loop_row_id));
      setStatus("Сохранение строки...");

      const actualLoopRowId = await ensurePersistedLoopRow(table, row);

      const values = Array.from({ length: Number(table.col_count || 0) }).map(
        (_, colIndex) => ({
          col_index: colIndex,
          value: getLoopRowValue(actualLoopRowId, colIndex),
          column_hint_text:
            table.column_hints?.[colIndex] || `Колонка ${colIndex + 1}`,
          semantic_key: null,
        })
      );

      await api.post("/manual-fill/save-loop-row", {
        teacher_id: role === "admin" ? teacherId : undefined,
        loop_row_id: actualLoopRowId,
        values,
      });

      setStatus("Строка сохранена");
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(
        e?.response?.data?.detail || e?.message || "Ошибка сохранения строки"
      );
    } finally {
      setSavingLoopRowId("");
    }
  }

  async function deleteLoopRow(row, tableId) {
    const ok = window.confirm("Удалить эту строку?");
    if (!ok) return;

    try {
      setDeletingLoopRowId(String(row.loop_row_id));
      setStatus("Удаление строки...");

      if (!row.persisted_loop_row_id) {
        setTableLoopRows((prev) => ({
          ...prev,
          [tableId]: (prev[tableId] || []).filter(
            (r) => r.loop_row_id !== row.loop_row_id
          ),
        }));

        setLoopValues((prev) => {
          const next = { ...prev };
          delete next[row.loop_row_id];
          return next;
        });

        setStatus("Строка удалена");
        return;
      }

      await api.delete(`/manual-fill/loop-row/${row.persisted_loop_row_id}`, {
        params: {
          teacher_id: role === "admin" ? teacherId : undefined,
        },
      });

      setStatus("Строка удалена");
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка удаления строки");
    } finally {
      setDeletingLoopRowId("");
    }
  }

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
        Заполнение разделов
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
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={labelStyle}>Учебный год</div>
            <input
              className="input"
              style={fieldStyle}
              value={academicYear}
              onChange={(e) => handleChangeYear(e.target.value)}
              placeholder="2025-2026"
            />
          </div>

          {role === "admin" ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={labelStyle}>Преподаватель</div>
              <select
                className="input"
                style={teacherFieldStyle}
                value={teacherId ? String(teacherId) : ""}
                onChange={(e) => {
                  const v = Number(e.target.value || 0);
                  setTeacherId(v);
                  localStorage.setItem("teacher_id", String(v));
                }}
              >
                {!teachers.length ? (
                  <option value="" style={{ color: "#17356f" }}>
                    Нет преподавателей
                  </option>
                ) : (
                  teachers.map((t) => (
                    <option
                      key={t.id}
                      value={String(t.id)}
                      style={{ color: "#17356f" }}
                    >
                      {t.full_name}
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : null}

          <div
            className="small"
            style={{
              color: status ? "#315fcb" : "#7c8aa5",
              fontWeight: 600,
              minHeight: 24,
              paddingBottom: 10,
            }}
          >
            {loading ? "Загрузка..." : status}
          </div>
        </div>

        {!tables.length && !loading ? (
          <div
            className="small"
            style={{
              padding: "16px 0",
              color: "#7c8aa5",
              fontWeight: 500,
            }}
          >
            Нет таблиц для заполнения
          </div>
        ) : null}

        {groupedSections.map((section) => (
          <div key={section.sectionTitle} style={{ marginTop: 24 }}>
            <div
              className="section-title"
              style={{
                marginTop: 0,
                marginBottom: 12,
                fontSize: 32,
                fontWeight: 800,
                color: "#17356f",
                letterSpacing: "-0.02em",
              }}
            >
              {section.sectionTitle}
            </div>

            {section.items.map((table) => (
              <div
                className="card"
                key={table.id}
                style={{
                  marginTop: 14,
                  borderRadius: 22,
                  overflow: "hidden",
                  border: "1px solid #e4ebf7",
                  background: "#fff",
                  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.05)",
                }}
              >
                <div
                  style={{
                    padding: 18,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    background: "#f7faff",
                    borderBottom: "1px solid #e4ebf7",
                  }}
                >
                  <div style={{ display: "grid", gap: 4 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 18,
                        color: "#17356f",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>Таблица {Number(table.table_index) + 1}</span>

                      {table.excel_bound ? (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#315fcb",
                            background: "rgba(49,95,203,0.10)",
                            border: "1px solid rgba(49,95,203,0.20)",
                            borderRadius: 999,
                            padding: "6px 10px",
                          }}
                        >
                          Excel
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#1f8f57",
                            background: "rgba(31,143,87,0.10)",
                            border: "1px solid rgba(31,143,87,0.20)",
                            borderRadius: 999,
                            padding: "6px 10px",
                          }}
                        >
                          Manual
                        </span>
                      )}

                      {table.prefill?.found ? (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#1f8f57",
                            background: "rgba(31,143,87,0.10)",
                            border: "1px solid rgba(31,143,87,0.20)",
                            borderRadius: 999,
                            padding: "6px 10px",
                          }}
                        >
                          Из прошлого года: {table.prefill?.source_academic_year}
                        </span>
                      ) : null}
                    </div>

                    <div
                      className="small"
                      style={{
                        color: "#6f83a8",
                        fontWeight: 500,
                      }}
                    >
                      {table.table_type === "loop"
                        ? "Таблица со строками"
                        : "Обычная таблица"}
                    </div>
                  </div>

                  <button
                    className="btn btn-outline"
                    onClick={() => toggleOpen(table.id)}
                    style={{
                      borderRadius: 12,
                      minWidth: 110,
                      height: 42,
                      fontWeight: 700,
                      border: "1px solid #d6e2fb",
                      background: "#fff",
                    }}
                  >
                    {openTableIds[table.id] ? "Скрыть" : "Открыть"}
                  </button>
                </div>

                {openTableIds[table.id] ? (
                  <div style={{ padding: 18 }}>
                    {table.table_type === "static" ? (
                      <>
                        <StaticTableGrid
                          table={table}
                          formValues={formValues}
                          onChange={setStaticValue}
                          readOnly={!!table.excel_bound}
                        />

                        {table.excel_bound ? (
                          <div
                            className="small"
                            style={{
                              marginTop: 14,
                              color: "#5f7195",
                              fontWeight: 500,
                            }}
                          >
                            Эта таблица заполняется из Excel нагрузки. Ручное сохранение отключено.
                          </div>
                        ) : null}

                        <div className="actions-row" style={{ marginTop: 14 }}>
                          <button
                            className="btn btn-primary"
                            onClick={() => saveStaticTable(table)}
                            disabled={table.excel_bound || savingStaticTableId === table.id}
                            style={{
                              minWidth: 150,
                              height: 46,
                              borderRadius: 14,
                              fontWeight: 700,
                              boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
                            }}
                          >
                            {savingStaticTableId === table.id
                              ? "Сохранение..."
                              : "Сохранить"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <LoopTableEditor
                        table={table}
                        rows={tableLoopRows[table.id] || []}
                        getLoopRowValue={getLoopRowValue}
                        setLoopRowValue={setLoopRowValue}
                        onAddRow={() => addLoopRow(table)}
                        onSaveRow={(row) => saveLoopRow(row, table)}
                        onDeleteRow={(row) => deleteLoopRow(row, table.id)}
                        addingLoopTableId={addingLoopTableId}
                        savingLoopRowId={savingLoopRowId}
                        deletingLoopRowId={deletingLoopRowId}
                        readOnly={!!table.excel_bound}
                      />
                    )}
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

function compressRow(row) {
  const out = [];
  let i = 0;

  while (i < row.length) {
    const cell = row[i];
    const text = String(cell?.text || "").trim();
    const editable = !!cell?.editable;

    if (editable) {
      out.push({
        type: "cell",
        cell,
        span: 1,
      });
      i += 1;
      continue;
    }

    if (!text) {
      out.push({
        type: "cell",
        cell,
        span: 1,
      });
      i += 1;
      continue;
    }

    let span = 1;
    let j = i + 1;

    while (j < row.length) {
      const next = row[j];
      const nextText = String(next?.text || "").trim();
      const nextEditable = !!next?.editable;

      if (nextEditable) break;
      if (nextText !== text) break;

      span += 1;
      j += 1;
    }

    out.push({
      type: "cell",
      cell,
      span,
    });

    i = j;
  }

  return out;
}

function StaticTableGrid({ table, formValues, onChange, readOnly = false }) {
  const matrix = Array.isArray(table.matrix) ? table.matrix : [];
  const prefillMap = new Map(
    (table.editable_values || [])
      .filter((x) => x.from_previous_year)
      .map((x) => [x.raw_cell_id, true])
  );

  return (
    <div
      style={{
        overflowX: "auto",
        borderRadius: 18,
        border: "1px solid #e4ebf7",
        background: "#fff",
      }}
    >
      <table
        className="table"
        style={{
          minWidth: Math.max(760, (table.col_count || 1) * 140),
          tableLayout: "fixed",
          borderCollapse: "separate",
          borderSpacing: 0,
          margin: 0,
        }}
      >
        <tbody>
          {matrix.length === 0 ? (
            <tr>
              <td
                style={{
                  padding: "24px 16px",
                  color: "#7c8aa5",
                  textAlign: "center",
                }}
              >
                Нет данных
              </td>
            </tr>
          ) : (
            matrix.map((row, rowIndex) => {
              const compressed = compressRow(row);

              return (
                <tr key={`row-${rowIndex}`}>
                  {compressed.map((item, idx) => {
                    const cell = item.cell;

                    return (
                      <td
                        key={`${cell.cell_key}-${idx}`}
                        colSpan={item.span}
                        style={{
                          verticalAlign: "top",
                          background: cell.editable ? "#f8fbff" : "#fff",
                          borderTop: "1px solid #edf2fb",
                          borderRight: "1px solid #edf2fb",
                          minWidth: 140,
                          padding: 12,
                        }}
                      >
                        {cell.editable ? (
                          <div>
                            {prefillMap.get(cell.raw_cell_id) ? (
                              <div
                                style={{
                                  marginBottom: 6,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: "#1f8f57",
                                }}
                              >
                                Перенесено из прошлого года
                              </div>
                            ) : null}

                            <input
                              className="input"
                              value={formValues[cell.raw_cell_id] ?? ""}
                              onChange={(e) =>
                                onChange(cell.raw_cell_id, e.target.value)
                              }
                              disabled={readOnly}
                              placeholder="Введите значение"
                              style={{
                                background: readOnly ? "#eef4ff" : "#fff",
                                border: "1px solid #d9e3f5",
                                borderRadius: 12,
                                minHeight: 42,
                                color: "#1f2f4d",
                                WebkitTextFillColor: "#1f2f4d",
                                caretColor: "#1f2f4d",
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              fontSize: 14,
                              lineHeight: 1.45,
                              color: "#1f2f4d",
                              fontWeight: rowIndex === 0 ? 700 : 500,
                            }}
                          >
                            {cell.text || ""}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function LoopTableEditor({
  table,
  rows,
  getLoopRowValue,
  setLoopRowValue,
  onAddRow,
  onSaveRow,
  onDeleteRow,
  addingLoopTableId,
  savingLoopRowId,
  deletingLoopRowId,
  readOnly = false,
}) {
  return (
    <div>
      <div
        style={{
          marginBottom: 14,
          padding: 16,
          borderRadius: 18,
          border: "1px solid #dce8ff",
          background:
            "linear-gradient(180deg, rgba(58,110,255,0.07) 0%, rgba(58,110,255,0.03) 100%)",
        }}
      >
        <div
          style={{
            fontWeight: 800,
            marginBottom: 6,
            color: "#17356f",
            fontSize: 17,
          }}
        >
          Добавляемые строки
        </div>
        <div
          className="small"
          style={{
            color: "#5f7195",
            fontWeight: 500,
          }}
        >
          Здесь можно добавлять, проверять и редактировать строки этого раздела.
        </div>
      </div>

      <div className="actions-row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          onClick={onAddRow}
          disabled={readOnly || addingLoopTableId === table.id}
          style={{
            minWidth: 170,
            height: 46,
            borderRadius: 14,
            fontWeight: 700,
            boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
          }}
        >
          {addingLoopTableId === table.id ? "Добавление..." : "Добавить строку"}
        </button>
      </div>

      {readOnly ? (
        <div
          className="small"
          style={{
            marginTop: 14,
            color: "#5f7195",
            fontWeight: 500,
          }}
        >
          Эта таблица заполняется из Excel нагрузки. Ручное редактирование отключено.
        </div>
      ) : null}

      {!rows?.length ? (
        <div
          className="small"
          style={{
            marginTop: 14,
            color: "#7c8aa5",
            fontWeight: 500,
          }}
        >
          Пока нет добавленных строк
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          {rows.map((row) => (
            <div
              key={String(row.loop_row_id)}
              className="card"
              style={{
                borderRadius: 18,
                border: "1px solid #e4ebf7",
                background: "#fff",
                padding: 16,
                boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#17356f",
                    fontSize: 17,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span>Строка {row.row_order}</span>

                  {row.isPrefilled ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#1f8f57",
                        background: "rgba(31,143,87,0.10)",
                        border: "1px solid rgba(31,143,87,0.20)",
                        borderRadius: 999,
                        padding: "5px 10px",
                      }}
                    >
                      Перенесено из прошлого года
                    </span>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => onSaveRow(row)}
                    disabled={readOnly || savingLoopRowId === String(row.loop_row_id)}
                    style={{
                      minWidth: 130,
                      height: 42,
                      borderRadius: 12,
                      fontWeight: 700,
                      boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
                    }}
                  >
                    {savingLoopRowId === String(row.loop_row_id)
                      ? "Сохранение..."
                      : "Сохранить"}
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => onDeleteRow(row)}
                    disabled={readOnly || deletingLoopRowId === String(row.loop_row_id)}
                    style={{
                      minWidth: 120,
                      height: 42,
                      borderRadius: 12,
                      fontWeight: 700,
                      boxShadow: "none",
                    }}
                  >
                    {deletingLoopRowId === String(row.loop_row_id)
                      ? "Удаление..."
                      : "Удалить"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.max(
                    1,
                    Number(table.col_count || 1)
                  )}, minmax(160px, 1fr))`,
                  gap: 12,
                }}
              >
                {Array.from({ length: Number(table.col_count || 0) }).map(
                  (_, colIndex) => {
                    const hint =
                      table.column_hints?.[colIndex] ||
                      `Колонка ${colIndex + 1}`;

                    return (
                      <div key={`${row.loop_row_id}-${colIndex}`}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            marginBottom: 6,
                            color: "#5f7195",
                          }}
                        >
                          {hint}
                        </div>

                        <input
                          className="input"
                          value={getLoopRowValue(
                            row.persisted_loop_row_id || row.loop_row_id,
                            colIndex
                          )}
                          onChange={(e) =>
                            setLoopRowValue(
                              row.persisted_loop_row_id || row.loop_row_id,
                              colIndex,
                              e.target.value
                            )
                          }
                          disabled={readOnly}
                          placeholder="Введите значение"
                          style={{
                            background: readOnly ? "#eef4ff" : "#f8fbff",
                            border: "1px solid #d9e3f5",
                            borderRadius: 12,
                            minHeight: 42,
                            color: "#1f2f4d",
                            WebkitTextFillColor: "#1f2f4d",
                            caretColor: "#1f2f4d",
                          }}
                        />
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
