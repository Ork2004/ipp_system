import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function ManualTablesPage() {
  const role = useMemo(() => localStorage.getItem("role") || "guest", []);
  const [departmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );
  const [rawTemplateId, setRawTemplateId] = useState(
    Number(localStorage.getItem("raw_template_id") || 0)
  );

  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState(
    Number(localStorage.getItem("teacher_id") || 0)
  );

  const [tables, setTables] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingTypeId, setSavingTypeId] = useState(0);
  const [savingStatic, setSavingStatic] = useState(false);
  const [addingLoopForTableId, setAddingLoopForTableId] = useState(0);
  const [savingLoopRowId, setSavingLoopRowId] = useState(0);
  const [deletingLoopRowId, setDeletingLoopRowId] = useState(0);
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

  async function loadTeachers() {
    if (role !== "admin" || !departmentId) return;
    try {
      const res = await api.get("/teachers", {
        params: { department_id: departmentId },
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setTeachers(list);

      if (!teacherId && list.length) {
        const first = Number(list[0].id);
        setTeacherId(first);
        localStorage.setItem("teacher_id", String(first));
      }
    } catch (e) {
      console.error(e);
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

  async function loadForm(templateId, currentTeacherId) {
    if (!templateId) {
      setTables([]);
      setStatus("Нет raw_template_id");
      return;
    }
    if (!currentTeacherId) {
      setTables([]);
      setStatus("Выбери преподавателя");
      return;
    }

    setLoading(true);
    try {
      const res = await api.get("/manual-fill/form", {
        params: {
          raw_template_id: templateId,
          teacher_id: currentTeacherId,
        },
      });

      const list = Array.isArray(res.data?.tables) ? res.data.tables : [];

      const normalized = list.map((table) => ({
        ...table,
        matrix: (table.matrix || []).map((row) =>
          row.map((cell) => ({
            ...cell,
            local_value:
              cell.saved_value !== undefined && cell.saved_value !== null
                ? String(cell.saved_value)
                : "",
          }))
        ),
        loop_rows: (table.loop_rows || []).map((row) => ({
          ...row,
          values_map: buildLoopValuesMap(row.values || [], table.col_count || 0),
        })),
      }));

      setTables(normalized);

      const opened = {};
      normalized.forEach((t, idx) => {
        opened[t.id] = idx < 3;
      });
      setOpenTableIds(opened);

      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки формы");
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

      const currentTeacherId =
        role === "teacher"
          ? Number(localStorage.getItem("teacher_id") || 0)
          : teacherId;

      if (!currentTeacherId) {
        setStatus("Выбери преподавателя");
        setTables([]);
        return;
      }

      setRawTemplateId(id);
      await loadForm(id, currentTeacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
      setTables([]);
    }
  }

  useEffect(() => {
    loadTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (role === "teacher") {
      const myTeacherId = Number(localStorage.getItem("teacher_id") || 0);
      if (myTeacherId) setTeacherId(myTeacherId);
    }
    reloadCurrent();

    const refresh = () => {
      setAcademicYear(localStorage.getItem("academic_year") || "2025-2026");
      setRawTemplateId(Number(localStorage.getItem("raw_template_id") || 0));
      setTeacherId(Number(localStorage.getItem("teacher_id") || 0) || 0);
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
  }, [role]);

  useEffect(() => {
    if (role === "admin" && teacherId && rawTemplateId) {
      loadForm(rawTemplateId, teacherId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

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

      const currentTeacherId =
        role === "teacher"
          ? Number(localStorage.getItem("teacher_id") || 0)
          : teacherId;

      if (!currentTeacherId) {
        setTables([]);
        setStatus("Выбери преподавателя");
        return;
      }

      await loadForm(id, currentTeacherId);
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

  function updateStaticCell(rawTableId, rawCellId, value) {
    setTables((prev) =>
      prev.map((table) => {
        if (table.id !== rawTableId) return table;

        return {
          ...table,
          matrix: (table.matrix || []).map((row) =>
            row.map((cell) =>
              cell.raw_cell_id === rawCellId
                ? { ...cell, local_value: value }
                : cell
            )
          ),
        };
      })
    );
  }

  async function saveStaticValues() {
    if (!rawTemplateId) {
      setStatus("Нет raw шаблона");
      return;
    }
    if (!teacherId) {
      setStatus("Нет teacher_id");
      return;
    }

    try {
      setSavingStatic(true);
      setStatus("Сохранение обычных таблиц...");

      const values = [];

      for (const table of tables) {
        if (table.table_type !== "static") continue;

        for (const row of table.matrix || []) {
          for (const cell of row) {
            if (!cell.editable) continue;
            values.push({
              raw_cell_id: cell.raw_cell_id,
              value: cell.local_value || "",
            });
          }
        }
      }

      await api.post("/manual-fill/save-static", {
        raw_template_id: rawTemplateId,
        teacher_id: teacherId,
        values,
      });

      setStatus("Обычные таблицы сохранены ✅");
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка сохранения static");
    } finally {
      setSavingStatic(false);
    }
  }

  async function addLoopRow(rawTableId) {
    if (!rawTemplateId || !teacherId) {
      setStatus("Нет raw_template_id или teacher_id");
      return;
    }

    try {
      setAddingLoopForTableId(rawTableId);
      setStatus("Добавление строки...");

      await api.post("/manual-fill/add-loop-row", {
        raw_template_id: rawTemplateId,
        raw_table_id: rawTableId,
        teacher_id: teacherId,
      });

      setStatus("Строка добавлена ✅");
      await loadForm(rawTemplateId, teacherId);
      setOpenTableIds((prev) => ({ ...prev, [rawTableId]: true }));
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка добавления строки");
    } finally {
      setAddingLoopForTableId(0);
    }
  }

  function updateLoopCell(rawTableId, loopRowId, colIndex, value) {
    setTables((prev) =>
      prev.map((table) => {
        if (table.id !== rawTableId) return table;

        return {
          ...table,
          loop_rows: (table.loop_rows || []).map((row) => {
            if (row.loop_row_id !== loopRowId) return row;
            return {
              ...row,
              values_map: {
                ...(row.values_map || {}),
                [colIndex]: value,
              },
            };
          }),
        };
      })
    );
  }

  async function saveLoopRow(rawTableId, loopRowId) {
    const table = tables.find((t) => t.id === rawTableId);
    const row = (table?.loop_rows || []).find((r) => r.loop_row_id === loopRowId);

    if (!row) {
      setStatus("Loop строка не найдена");
      return;
    }

    try {
      setSavingLoopRowId(loopRowId);
      setStatus("Сохранение строки...");

      const values = [];
      const colCount = Number(table?.col_count || 0);

      for (let col = 0; col < colCount; col += 1) {
        values.push({
          col_index: col,
          value: row.values_map?.[col] || "",
        });
      }

      await api.post("/manual-fill/save-loop-row", {
        teacher_id: teacherId,
        loop_row_id: loopRowId,
        values,
      });

      setStatus("Loop строка сохранена ✅");
      await loadForm(rawTemplateId, teacherId);
      setOpenTableIds((prev) => ({ ...prev, [rawTableId]: true }));
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка сохранения строки");
    } finally {
      setSavingLoopRowId(0);
    }
  }

  async function deleteLoopRow(loopRowId, rawTableId) {
    const ok = window.confirm("Удалить эту строку?");
    if (!ok) return;

    try {
      setDeletingLoopRowId(loopRowId);
      setStatus("Удаление строки...");

      await api.delete(`/manual-fill/loop-row/${loopRowId}`, {
        params: { teacher_id: teacherId },
      });

      setStatus("Строка удалена ✅");
      await loadForm(rawTemplateId, teacherId);
      setOpenTableIds((prev) => ({ ...prev, [rawTableId]: true }));
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка удаления строки");
    } finally {
      setDeletingLoopRowId(0);
    }
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

          {role === "admin" ? (
            <select
              className="input"
              style={{ width: 420 }}
              value={teacherId ? String(teacherId) : ""}
              onChange={(e) => {
                const v = Number(e.target.value || 0);
                setTeacherId(v);
                localStorage.setItem("teacher_id", String(v));
              }}
            >
              {!teachers.length ? (
                <option value="">Нет преподавателей</option>
              ) : (
                teachers.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.full_name}
                  </option>
                ))
              )}
            </select>
          ) : null}

          <div className="small">
            raw_template_id: {rawTemplateId || "—"} | department_id:{" "}
            {departmentId || "—"}
          </div>

          <div className="small">{loading ? "Загрузка..." : status}</div>
        </div>

        <div className="actions-row" style={{ marginBottom: 14 }}>
          <button
            className="btn btn-primary"
            onClick={saveStaticValues}
            disabled={savingStatic || !tables.some((t) => t.table_type === "static")}
          >
            {savingStatic ? "Сохранение..." : "СОХРАНИТЬ ОБЫЧНЫЕ ТАБЛИЦЫ"}
          </button>
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
                      {table.row_count} строк • {table.col_count} колонок
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
                        <b>Подсказки колонок:</b>{" "}
                        {(table.column_hints || []).join(" | ") || "—"}
                      </div>
                    </div>

                    {table.table_type === "static" ? (
                      <StaticTableGrid
                        table={table}
                        onChange={updateStaticCell}
                      />
                    ) : (
                      <LoopTableEditor
                        table={table}
                        addingLoopForTableId={addingLoopForTableId}
                        savingLoopRowId={savingLoopRowId}
                        deletingLoopRowId={deletingLoopRowId}
                        onAddRow={addLoopRow}
                        onChangeCell={updateLoopCell}
                        onSaveRow={saveLoopRow}
                        onDeleteRow={deleteLoopRow}
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

function StaticTableGrid({ table, onChange }) {
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
                      <textarea
                        className="input"
                        value={cell.local_value || ""}
                        onChange={(e) =>
                          onChange(table.id, cell.raw_cell_id, e.target.value)
                        }
                        placeholder="Введите значение"
                        rows={3}
                        style={{
                          resize: "vertical",
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

function LoopTableEditor({
  table,
  addingLoopForTableId,
  savingLoopRowId,
  deletingLoopRowId,
  onAddRow,
  onChangeCell,
  onSaveRow,
  onDeleteRow,
}) {
  const rows = Array.isArray(table.loop_rows) ? table.loop_rows : [];
  const colCount = Number(table.col_count || 0);
  const headers =
    Array.isArray(table.column_hints) && table.column_hints.length
      ? table.column_hints
      : Array.from({ length: colCount }, (_, i) => `Колонка ${i + 1}`);

  return (
    <div>
      <div className="actions-row" style={{ marginBottom: 12 }}>
        <button
          className="btn btn-primary"
          onClick={() => onAddRow(table.id)}
          disabled={addingLoopForTableId === table.id}
        >
          {addingLoopForTableId === table.id ? "Добавление..." : "ДОБАВИТЬ СТРОКУ"}
        </button>
      </div>

      {!rows.length ? (
        <div className="small">Пока нет добавленных строк</div>
      ) : null}

      {rows.map((row) => (
        <div
          key={row.loop_row_id}
          className="card"
          style={{
            marginTop: 10,
            borderRadius: 12,
            border: "1px solid rgba(15,23,42,.10)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              background: "#fcfdff",
              borderBottom: "1px solid rgba(15,23,42,.08)",
            }}
          >
            <div style={{ fontWeight: 700 }}>Строка #{row.row_order}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-outline"
                onClick={() => onSaveRow(table.id, row.loop_row_id)}
                disabled={savingLoopRowId === row.loop_row_id}
              >
                {savingLoopRowId === row.loop_row_id
                  ? "Сохранение..."
                  : "Сохранить строку"}
              </button>

              <button
                className="btn btn-danger"
                onClick={() => onDeleteRow(row.loop_row_id, table.id)}
                disabled={deletingLoopRowId === row.loop_row_id}
              >
                {deletingLoopRowId === row.loop_row_id
                  ? "Удаление..."
                  : "Удалить"}
              </button>
            </div>
          </div>

          <div style={{ padding: 12, overflowX: "auto" }}>
            <table
              className="table"
              style={{
                minWidth: Math.max(760, colCount * 180),
                tableLayout: "fixed",
              }}
            >
              <thead>
                <tr>
                  {headers.map((h, idx) => (
                    <th key={`${row.loop_row_id}-h-${idx}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {Array.from({ length: colCount }, (_, colIndex) => (
                    <td key={`${row.loop_row_id}-c-${colIndex}`}>
                      <textarea
                        className="input"
                        rows={3}
                        value={row.values_map?.[colIndex] || ""}
                        onChange={(e) =>
                          onChangeCell(
                            table.id,
                            row.loop_row_id,
                            colIndex,
                            e.target.value
                          )
                        }
                        placeholder="Введите значение"
                        style={{ resize: "vertical" }}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildLoopValuesMap(values, colCount) {
  const map = {};
  for (let i = 0; i < colCount; i += 1) {
    map[i] = "";
  }
  for (const item of values) {
    map[item.col_index] =
      item.value !== undefined && item.value !== null ? String(item.value) : "";
  }
  return map;
}