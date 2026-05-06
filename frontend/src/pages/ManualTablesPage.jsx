import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const fieldStyle = {
  width: "min(220px, 100%)",
  height: 42,
  borderRadius: 8,
  border: "1px solid #d8dee8",
  background: "#fff",
  boxShadow: "none",
  color: "#1f2a44",
  fontSize: 14,
  fontWeight: 600,
  padding: "0 12px",
  outline: "none",
  opacity: 1,
  WebkitTextFillColor: "#1f2a44",
};

const teacherFieldStyle = {
  ...fieldStyle,
  width: "min(360px, 100%)",
};

const labelStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#536278",
  marginBottom: 6,
  letterSpacing: 0,
};

const badgeBaseStyle = {
  fontSize: 11,
  fontWeight: 700,
  borderRadius: 999,
  padding: "4px 7px",
  lineHeight: 1,
};

const excelBadgeStyle = {
  ...badgeBaseStyle,
  color: "#536278",
  background: "#f8fafc",
  border: "1px solid #e1e7ef",
};

const manualBadgeStyle = {
  ...badgeBaseStyle,
  color: "#315fcb",
  background: "#f7faff",
  border: "1px solid #d8e5ff",
};

const yearBadgeStyle = {
  ...badgeBaseStyle,
  color: "#6f7b8f",
  background: "#fff",
  border: "1px solid #e1e7ef",
};

const valueBoxStyle = {
  minHeight: 36,
  padding: "8px 10px",
  border: "1px solid #d9e3f5",
  borderRadius: 8,
  background: "#fff",
  color: "#1f2f4d",
  fontWeight: 600,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const tableNumberStyle = {
  width: 34,
  height: 34,
  borderRadius: 8,
  background: "#eef4ff",
  color: "#2f5cb8",
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 800,
  flex: "0 0 auto",
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
  const [savingLoopTableId, setSavingLoopTableId] = useState(0);
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
      setStatus("Загрузка...");
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

      setStatus("");
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

      setStatus("");
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

  async function _persistAndSaveRow(table, row) {
    // Capture values before ensurePersistedLoopRow to avoid reading stale state
    const clientId = row.persisted_loop_row_id || row.loop_row_id;
    const values = Array.from({ length: Number(table.col_count || 0) }).map(
      (_, colIndex) => ({
        col_index: colIndex,
        value: getLoopRowValue(clientId, colIndex),
        column_hint_text:
          table.column_hints?.[colIndex] || `Колонка ${colIndex + 1}`,
        semantic_key: null,
        stable_column_key: table.stable_column_keys?.[colIndex] || null,
      })
    );

    const actualLoopRowId = await ensurePersistedLoopRow(table, row);

    await api.post("/manual-fill/save-loop-row", {
      teacher_id: role === "admin" ? teacherId : undefined,
      loop_row_id: actualLoopRowId,
      values,
    });
  }

  async function saveAllLoopRows(table) {
    const rows = tableLoopRows[table.id] || [];
    if (!rows.length) return;

    try {
      setSavingLoopTableId(table.id);
      setStatus("Сохранение...");

      for (const row of rows) {
        await _persistAndSaveRow(table, row);
      }

      setStatus("");
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || e?.message || "Ошибка сохранения");
    } finally {
      setSavingLoopTableId(0);
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

        setStatus("");
        return;
      }

      await api.delete(`/manual-fill/loop-row/${row.persisted_loop_row_id}`, {
        params: {
          teacher_id: role === "admin" ? teacherId : undefined,
        },
      });

      setStatus("");
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
        maxWidth: 1120,
        paddingTop: 24,
        paddingBottom: 44,
      }}
    >
      <div
        className="page-title"
        style={{
          fontSize: 30,
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: 0,
          marginBottom: 18,
          color: "#172033",
        }}
      >
        Заполнение разделов
      </div>

      <div
        className="card card-pad"
        style={{
          borderRadius: 0,
          padding: 0,
          background: "transparent",
          border: "none",
          boxShadow: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-end",
            marginBottom: 20,
            padding: 14,
            borderRadius: 10,
            border: "1px solid #e0e7f1",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
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

          {loading || status ? (
            <div
              className="small"
              style={{
                color: status ? "#315fcb" : "#7c8aa5",
                fontWeight: 600,
                minHeight: 32,
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {loading ? "Загрузка..." : status}
            </div>
          ) : null}
        </div>

        {!tables.length && !loading ? (
          <div
            className="small"
            style={{
              padding: "22px 0",
              color: "#7c8aa5",
              fontWeight: 600,
              textAlign: "center",
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
                margin: 0,
                padding: "0 2px 10px",
                fontSize: 18,
                fontWeight: 800,
                color: "#172033",
                letterSpacing: 0,
                borderBottom: "1px solid #dfe7f2",
              }}
            >
              {section.sectionTitle}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
                gap: 12,
                marginTop: 12,
              }}
            >
              {section.items.map((table) => {
                const isOpen = !!openTableIds[table.id];

                return (
              <div
                className="card"
                key={table.id}
                style={{
                  gridColumn: isOpen ? "1 / -1" : "auto",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: isOpen ? "1px solid #cbd8eb" : "1px solid #e2e8f0",
                  background: "#fff",
                  boxShadow: isOpen
                    ? "0 12px 30px rgba(15, 23, 42, 0.065)"
                    : "0 2px 8px rgba(15, 23, 42, 0.035)",
                }}
              >
                <div
                  style={{
                    padding: 14,
                    minHeight: 82,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    background: isOpen ? "#f8fbff" : "#fff",
                    borderBottom: isOpen ? "1px solid #e4ebf7" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      minWidth: 0,
                    }}
                  >
                    <span style={tableNumberStyle}>
                      {String(Number(table.table_index) + 1).padStart(2, "0")}
                    </span>

                    <div style={{ display: "grid", gap: 7, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 15,
                        color: "#172033",
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>Таблица {Number(table.table_index) + 1}</span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {table.excel_bound ? (
                        <span style={excelBadgeStyle}>Excel</span>
                      ) : (
                        <span style={manualBadgeStyle}>Manual</span>
                      )}

                      {table.prefill?.found ? (
                        <span style={yearBadgeStyle}>
                          {table.prefill?.source_academic_year}
                        </span>
                      ) : null}
                    </div>

                    </div>
                  </div>

                  <button
                    className="btn btn-outline"
                    onClick={() => toggleOpen(table.id)}
                    style={{
                      borderRadius: 8,
                      minWidth: 84,
                      height: 34,
                      fontWeight: 700,
                      color: isOpen ? "#1d4ed8" : "#243b7a",
                      border: isOpen
                        ? "1px solid #c7d7f5"
                        : "1px solid #dce5f2",
                      background: "#fff",
                      boxShadow: "none",
                    }}
                  >
                    {isOpen ? "Скрыть" : "Открыть"}
                  </button>
                </div>

                {isOpen ? (
                  <div
                    style={{
                      padding: 14,
                      background: "#f8fbff",
                    }}
                  >
                    {table.table_type === "static" ? (
                      <>
                        <StaticTableGrid
                          table={table}
                          formValues={formValues}
                          onChange={setStaticValue}
                          readOnly={!!table.excel_bound}
                        />

                              {!table.excel_bound ? (
                                <div
                                  className="actions-row"
                                  style={{
                                    marginTop: 14,
                                    justifyContent: "flex-end",
                                  }}
                                >
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => saveStaticTable(table)}
                                    disabled={savingStaticTableId === table.id}
                                    style={{
                                      minWidth: 120,
                                      height: 38,
                                      borderRadius: 8,
                                      fontWeight: 700,
                                      boxShadow: "none",
                                    }}
                                  >
                                    {savingStaticTableId === table.id
                                      ? "Сохранение..."
                                      : "Сохранить"}
                                  </button>
                                </div>
                              ) : null}
                            </>
                          ) : table.excel_bound ? (
                            <LoopTablePreview
                              table={table}
                              rows={tableLoopRows[table.id] || []}
                              getLoopRowValue={getLoopRowValue}
                            />
                          ) : (
                            <LoopTableEditor
                              table={table}
                              rows={tableLoopRows[table.id] || []}
                              getLoopRowValue={getLoopRowValue}
                              setLoopRowValue={setLoopRowValue}
                              onAddRow={() => addLoopRow(table)}
                              onSaveTable={() => saveAllLoopRows(table)}
                              onDeleteRow={(row) => deleteLoopRow(row, table.id)}
                              addingLoopTableId={addingLoopTableId}
                              savingLoopTableId={savingLoopTableId}
                              savingThisTable={savingLoopTableId === table.id}
                              deletingLoopRowId={deletingLoopRowId}
                            />
                      )}
                  </div>
                ) : null}
              </div>
                );
              })}
            </div>
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
        overflow: "visible",
        borderRadius: 8,
        border: "1px solid #e0e7f1",
        background: "#fff",
        boxShadow: "none",
      }}
    >
      <table
        className="table"
        style={{
          width: "100%",
          minWidth: 0,
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
                          background: cell.editable
                            ? "#fff"
                            : rowIndex === 0
                              ? "#f8fafc"
                              : "#fff",
                          borderTop: "1px solid #edf1f6",
                          borderRight: "1px solid #edf1f6",
                          minWidth: 0,
                          padding: 9,
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
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

                            {readOnly ? (
                              <div
                                style={{
                                  ...valueBoxStyle,
                                  background: "#fff",
                                }}
                              >
                                {formValues[cell.raw_cell_id] || "—"}
                              </div>
                            ) : (
                              <input
                                className="input"
                                value={formValues[cell.raw_cell_id] ?? ""}
                                onChange={(e) =>
                                  onChange(cell.raw_cell_id, e.target.value)
                                }
                                placeholder="Введите значение"
                                style={{
                                  background: "#fff",
                                  border: "1px solid #d9e3f5",
                                  borderRadius: 8,
                                  minHeight: 36,
                                  padding: "8px 10px",
                                  color: "#1f2f4d",
                                  WebkitTextFillColor: "#1f2f4d",
                                  caretColor: "#1f2f4d",
                                  minWidth: 0,
                                }}
                              />
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              fontSize: 13,
                              lineHeight: 1.35,
                              color: "#1f2f4d",
                              fontWeight: rowIndex === 0 ? 700 : 500,
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
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

function LoopTablePreview({ table, rows, getLoopRowValue }) {
  const colCount = Math.max(0, Number(table.col_count || 0));

  if (!rows?.length || !colCount) {
    return (
      <div
        className="small"
        style={{
          padding: 16,
          border: "1px solid #e0e7f1",
          borderRadius: 8,
          background: "#fff",
          color: "#7c8aa5",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        Нет данных
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((row, rowIndex) => {
        const rowId = row.persisted_loop_row_id || row.loop_row_id;

        return (
          <div
            key={String(rowId ?? row.row_order ?? rowIndex)}
            style={{
              borderRadius: 8,
              border: "1px solid #e0e7f1",
              background: "#fff",
              padding: 12,
              boxShadow: "none",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
                gap: 9,
              }}
            >
              {Array.from({ length: colCount }).map((_, colIndex) => {
                const hint =
                  table.column_hints?.[colIndex] || `Колонка ${colIndex + 1}`;
                const value = getLoopRowValue(rowId, colIndex);

                return (
                  <div key={`${rowId ?? rowIndex}-${colIndex}`}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        marginBottom: 5,
                        color: "#5d6d85",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {hint}
                    </div>

                    <div
                      style={{
                        ...valueBoxStyle,
                      }}
                    >
                      {value || "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoopTableEditor({
  table,
  rows,
  getLoopRowValue,
  setLoopRowValue,
  onAddRow,
  onSaveTable,
  onDeleteRow,
  addingLoopTableId,
  savingThisTable,
  deletingLoopRowId,
}) {
  return (
    <div>
      <div
        className="actions-row"
        style={{
          marginTop: 0,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "flex-start",
        }}
      >
        <button
          className="btn btn-outline"
          onClick={onAddRow}
          disabled={addingLoopTableId === table.id}
          style={{
            minWidth: 120,
            height: 38,
            borderRadius: 8,
            fontWeight: 700,
            boxShadow: "none",
          }}
        >
          {addingLoopTableId === table.id ? "Добавление..." : "+ Строка"}
        </button>

        <button
          className="btn btn-primary"
          onClick={onSaveTable}
          disabled={savingThisTable || !rows?.length}
          style={{
            minWidth: 170,
            height: 38,
            borderRadius: 8,
            fontWeight: 700,
            boxShadow: "none",
            background: savingThisTable ? undefined : "#1a7f52",
            borderColor: savingThisTable ? undefined : "#1a7f52",
          }}
        >
          {savingThisTable ? "Сохранение..." : "Сохранить таблицу"}
        </button>
      </div>

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
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {rows.map((row) => (
            <div
              key={String(row.loop_row_id)}
              className="card"
              style={{
                borderRadius: 8,
                border: "1px solid #e0e7f1",
                background: "#fff",
                padding: 12,
                boxShadow: "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#172033",
                    fontSize: 15,
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
                        ...yearBadgeStyle,
                        fontSize: 11,
                      }}
                    >
                      Перенесено из прошлого года
                    </span>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-outline"
                    onClick={() => onDeleteRow(row)}
                    disabled={deletingLoopRowId === String(row.loop_row_id)}
                    style={{
                      minWidth: 120,
                      height: 34,
                      borderRadius: 8,
                      fontWeight: 700,
                      boxShadow: "none",
                      color: "#b42318",
                      border: "1px solid #f3c4be",
                      background: "#fff",
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
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
                  gap: 9,
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
                            marginBottom: 5,
                            color: "#5d6d85",
                            overflowWrap: "anywhere",
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
                          placeholder="Введите значение"
                          style={{
                            background: "#fff",
                            border: "1px solid #d9e3f5",
                            borderRadius: 8,
                            minHeight: 36,
                            padding: "8px 10px",
                            color: "#1f2f4d",
                            WebkitTextFillColor: "#1f2f4d",
                            caretColor: "#1f2f4d",
                            minWidth: 0,
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
