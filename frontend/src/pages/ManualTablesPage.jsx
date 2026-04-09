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

  async function saveStaticTable(table) {
    try {
      setSavingStatic(true);
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

      await api.post("/manual-fill/add-loop-row", {
        raw_template_id: rawTemplateId,
        raw_table_id: table.id,
        teacher_id: role === "admin" ? teacherId : undefined,
      });

      await loadForm(rawTemplateId, teacherId);
      setStatus("Строка добавлена");
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

      setStatus("Строка сохранена");
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

      setStatus("Строка удалена");
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка удаления строки");
    } finally {
      setDeletingLoopRowId(0);
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
                      }}
                    >
                      Таблица {Number(table.table_index) + 1}
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
                        />

                        <div className="actions-row" style={{ marginTop: 14 }}>
                          <button
                            className="btn btn-primary"
                            onClick={() => saveStaticTable(table)}
                            disabled={savingStatic}
                            style={{
                              minWidth: 150,
                              height: 46,
                              borderRadius: 14,
                              fontWeight: 700,
                              boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
                            }}
                          >
                            {savingStatic ? "Сохранение..." : "Сохранить"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <LoopTableEditor
                        table={table}
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

function StaticTableGrid({ table, formValues, onChange }) {
  const matrix = Array.isArray(table.matrix) ? table.matrix : [];

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
                              borderRadius: 12,
                              minHeight: 42,
                            }}
                          />
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
          Здесь можно добавлять и редактировать строки этого раздела.
        </div>
      </div>

      <div className="actions-row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          onClick={onAddRow}
          disabled={addingLoopTableId === table.id}
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

      {!table.loop_rows?.length ? (
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
          {table.loop_rows.map((row) => (
            <div
              key={row.loop_row_id}
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
                  }}
                >
                  Строка {row.row_order}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => onSaveRow(row.loop_row_id)}
                    disabled={savingLoopRowId === row.loop_row_id}
                    style={{
                      minWidth: 130,
                      height: 42,
                      borderRadius: 12,
                      fontWeight: 700,
                      boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
                    }}
                  >
                    {savingLoopRowId === row.loop_row_id
                      ? "Сохранение..."
                      : "Сохранить"}
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={() => onDeleteRow(row.loop_row_id)}
                    disabled={deletingLoopRowId === row.loop_row_id}
                    style={{
                      minWidth: 120,
                      height: 42,
                      borderRadius: 12,
                      fontWeight: 700,
                      boxShadow: "none",
                    }}
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
                  gap: 12,
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
                            fontWeight: 800,
                            marginBottom: 6,
                            color: "#5f7195",
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
                          placeholder="Введите значение"
                          style={{
                            background: "#f8fbff",
                            border: "1px solid #d9e3f5",
                            borderRadius: 12,
                            minHeight: 42,
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