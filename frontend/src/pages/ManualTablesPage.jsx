import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

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
  const [savingTypeId, setSavingTypeId] = useState(0);
  const [savingStatic, setSavingStatic] = useState(false);
  const [openTableIds, setOpenTableIds] = useState({});
  const [formValues, setFormValues] = useState({});
  const [loopValues, setLoopValues] = useState({});
  const [savingLoopRowId, setSavingLoopRowId] = useState(0);
  const [addingLoopTableId, setAddingLoopTableId] = useState(0);
  const [deletingLoopRowId, setDeletingLoopRowId] = useState(0);

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
        const firstId = Number(list[0].id);
        setTeacherId(firstId);
        localStorage.setItem("teacher_id", String(firstId));
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

  function buildInitialStateFromTables(list) {
    const nextFormValues = {};
    const nextLoopValues = {};

    for (const table of list) {
      if (table.table_type === "static") {
        for (const item of table.editable_values || []) {
          nextFormValues[item.raw_cell_id] = item.value ?? "";
        }
      }

      if (table.table_type === "loop") {
        for (const row of table.loop_rows || []) {
          nextLoopValues[row.loop_row_id] = {};
          for (const v of row.values || []) {
            nextLoopValues[row.loop_row_id][v.col_index] = v.value ?? "";
          }
        }
      }
    }

    setFormValues(nextFormValues);
    setLoopValues(nextLoopValues);
  }

  async function loadForm(templateId, currentTeacherId) {
    if (!templateId) {
      setTables([]);
      setStatus("Нет raw_template_id");
      return;
    }

    if (role === "admin" && !currentTeacherId) {
      setTables([]);
      setStatus("Выбери преподавателя");
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

      const opened = {};
      list.forEach((t, idx) => {
        opened[t.id] = idx < 3;
      });
      setOpenTableIds(opened);

      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки формы");
      setTables([]);
      setFormValues({});
      setLoopValues({});
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
      await loadForm(id, teacherId);
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
    reloadCurrent();

    const refresh = () => {
      setAcademicYear(localStorage.getItem("academic_year") || "2025-2026");
      setRawTemplateId(Number(localStorage.getItem("raw_template_id") || 0));
      setTeacherId(Number(localStorage.getItem("teacher_id") || 0));
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
      await loadForm(id, teacherId);
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

      await loadForm(rawTemplateId, teacherId);
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

  function setStaticValue(rawCellId, value) {
    setFormValues((prev) => ({
      ...prev,
      [rawCellId]: value,
    }));
  }

  async function saveStaticTable(table) {
    try {
      setSavingStatic(true);
      setStatus("Сохранение таблицы...");

      const values = (table.editable_values || []).map((item) => ({
        raw_cell_id: item.raw_cell_id,
        value: formValues[item.raw_cell_id] ?? "",
      }));

      await api.post("/manual-fill/save-static", {
        raw_template_id: rawTemplateId,
        teacher_id: role === "admin" ? teacherId : undefined,
        values,
      });

      setStatus("Данные таблицы сохранены ✅");
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка сохранения static таблицы");
    } finally {
      setSavingStatic(false);
    }
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

  async function addLoopRow(table) {
    try {
      setAddingLoopTableId(table.id);
      setStatus("Добавление строки...");

      const res = await api.post("/manual-fill/add-loop-row", {
        raw_template_id: rawTemplateId,
        raw_table_id: table.id,
        teacher_id: role === "admin" ? teacherId : undefined,
      });

      const loopRowId = Number(res.data?.loop_row_id || 0);
      if (loopRowId) {
        const emptyRow = {};
        for (let i = 0; i < Number(table.col_count || 0); i += 1) {
          emptyRow[i] = "";
        }
        setLoopValues((prev) => ({
          ...prev,
          [loopRowId]: emptyRow,
        }));
      }

      await loadForm(rawTemplateId, teacherId);
      setStatus("Новая строка добавлена ✅");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка добавления строки");
    } finally {
      setAddingLoopTableId(0);
    }
  }

  async function saveLoopRow(loopRowId, table) {
    try {
      setSavingLoopRowId(loopRowId);
      setStatus("Сохранение строки...");

      const values = [];
      for (let i = 0; i < Number(table.col_count || 0); i += 1) {
        values.push({
          col_index: i,
          value: getLoopRowValue(loopRowId, i),
        });
      }

      await api.post("/manual-fill/save-loop-row", {
        teacher_id: role === "admin" ? teacherId : undefined,
        loop_row_id: loopRowId,
        values,
      });

      setStatus("Строка сохранена ✅");
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка сохранения строки");
    } finally {
      setSavingLoopRowId(0);
    }
  }

  async function deleteLoopRow(loopRowId) {
    const ok = window.confirm("Удалить эту строку?");
    if (!ok) return;

    try {
      setDeletingLoopRowId(loopRowId);
      setStatus("Удаление строки...");

      await api.delete(`/manual-fill/loop-row/${loopRowId}`, {
        params: {
          teacher_id: role === "admin" ? teacherId : undefined,
        },
      });

      setStatus("Строка удалена ✅");
      await loadForm(rawTemplateId, teacherId);
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

                    {table.table_type === "static" ? (
                      <>
                        <StaticTableGrid
                          table={table}
                          formValues={formValues}
                          onChange={setStaticValue}
                        />

                        <div className="actions-row" style={{ marginTop: 12 }}>
                          <button
                            className="btn btn-primary"
                            onClick={() => saveStaticTable(table)}
                            disabled={savingStatic}
                          >
                            {savingStatic ? "Сохранение..." : "Сохранить таблицу"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <LoopTableEditor
                        table={table}
                        loopValues={loopValues}
                        getLoopRowValue={getLoopRowValue}
                        setLoopRowValue={setLoopRowValue}
                        onAddRow={() => addLoopRow(table)}
                        onSaveRow={(loopRowId) => saveLoopRow(loopRowId, table)}
                        onDeleteRow={deleteLoopRow}
                        addingLoopTableId={addingLoopTableId}
                        savingLoopRowId={savingLoopRowId}
                        deletingLoopRowId={deletingLoopRowId}
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

function StaticTableGrid({ table, formValues, onChange }) {
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
                        value={formValues[cell.raw_cell_id] ?? ""}
                        onChange={(e) =>
                          onChange(cell.raw_cell_id, e.target.value)
                        }
                        placeholder="Введите значение"
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

function LoopTableEditor({
  table,
  loopValues,
  getLoopRowValue,
  setLoopRowValue,
  onAddRow,
  onSaveRow,
  onDeleteRow,
  addingLoopTableId,
  savingLoopRowId,
  deletingLoopRowId,
}) {
  const templateRow =
    table.loop_template_row_index !== null &&
    table.loop_template_row_index !== undefined
      ? table.matrix?.[table.loop_template_row_index] || null
      : null;

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table
          className="table"
          style={{
            minWidth: Math.max(760, (table.col_count || 1) * 160),
            tableLayout: "fixed",
          }}
        >
          <tbody>
            {(table.matrix || []).map((row, rowIndex) => (
              <tr key={`tpl-row-${rowIndex}`}>
                {row.map((cell) => (
                  <td
                    key={cell.cell_key}
                    style={{
                      verticalAlign: "top",
                      background:
                        rowIndex === table.loop_template_row_index
                          ? "rgba(251,191,36,.12)"
                          : "#fff",
                      borderTop: "1px solid rgba(15,23,42,.06)",
                      minWidth: 160,
                    }}
                  >
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {cell.text || ""}
                    </div>

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
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 12,
          background: "rgba(47,107,255,.06)",
          border: "1px solid rgba(47,107,255,.12)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Loop-строки</div>
        <div className="small">
          Шаблонная строка подсвечена. Ниже преподаватель добавляет свои строки.
        </div>
      </div>

      <div className="actions-row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          onClick={onAddRow}
          disabled={addingLoopTableId === table.id}
        >
          {addingLoopTableId === table.id ? "Добавление..." : "Добавить строку"}
        </button>
      </div>

      {!table.loop_rows?.length ? (
        <div className="small" style={{ marginTop: 12 }}>
          Пока нет добавленных строк
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {table.loop_rows.map((row) => (
            <div
              key={row.loop_row_id}
              className="card"
              style={{
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,.10)",
                padding: 12,
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
                <div style={{ fontWeight: 700 }}>
                  Строка #{row.row_order}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => onSaveRow(row.loop_row_id)}
                    disabled={savingLoopRowId === row.loop_row_id}
                  >
                    {savingLoopRowId === row.loop_row_id
                      ? "Сохранение..."
                      : "Сохранить строку"}
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => onDeleteRow(row.loop_row_id)}
                    disabled={deletingLoopRowId === row.loop_row_id}
                  >
                    {deletingLoopRowId === row.loop_row_id
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
                  gap: 10,
                }}
              >
                {Array.from({ length: Number(table.col_count || 0) }).map(
                  (_, colIndex) => {
                    const hint =
                      table.column_hints?.[colIndex] ||
                      templateRow?.[colIndex]?.text ||
                      `Колонка ${colIndex + 1}`;

                    return (
                      <div key={`${row.loop_row_id}-${colIndex}`}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 6,
                            color: "#334155",
                          }}
                        >
                          {hint}
                        </div>
                        <input
                          className="input"
                          value={getLoopRowValue(row.loop_row_id, colIndex)}
                          onChange={(e) =>
                            setLoopRowValue(
                              row.loop_row_id,
                              colIndex,
                              e.target.value
                            )
                          }
                          placeholder={`Введите значение`}
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