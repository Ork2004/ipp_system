import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

// ─── Tiny icon components (no deps) ─────────────────────────────────────────

function IconChevron({ open }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: "transform 0.22s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  );
}

function IconTable() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  );
}

function IconEmpty() {
  return (
    <svg width="52" height="52" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.35 }}>
      <rect x="8" y="8" width="48" height="48" rx="6" stroke="#2f6bff" strokeWidth="2.5" />
      <line x1="8" y1="22" x2="56" y2="22" stroke="#2f6bff" strokeWidth="2.5" />
      <line x1="8" y1="36" x2="56" y2="36" stroke="#2f6bff" strokeWidth="2" />
      <line x1="24" y1="22" x2="24" y2="56" stroke="#2f6bff" strokeWidth="2" />
      <circle cx="32" cy="43" r="7" fill="#2f6bff" opacity="0.12" />
      <line x1="29" y1="43" x2="35" y2="43" stroke="#2f6bff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeTempLoopRowId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const [statusKind, setStatusKind] = useState("info");
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

  // ── Data loading ────────────────────────────────────────────────────────────

  async function loadTeachers(currentTeacherId = 0) {
    if (role !== "admin" || !departmentId) return;
    try {
      const res = await api.get("/teachers", { params: { department_id: departmentId } });
      const list = Array.isArray(res.data) ? res.data : [];
      setTeachers(list);
      if (!list.length) { setTeacherId(0); localStorage.removeItem("teacher_id"); return; }
      const hasCurrent = list.some((t) => Number(t.id) === Number(currentTeacherId));
      if (hasCurrent) {
        setTeacherId(Number(currentTeacherId));
      } else {
        const firstId = Number(list[0].id);
        setTeacherId(firstId);
        localStorage.setItem("teacher_id", String(firstId));
      }
    } catch (e) { console.error(e); setTeachers([]); }
  }

  async function resolveRawTemplateIdByYear(year) {
    if (!departmentId || !year) return 0;
    const res = await api.get("/raw-template/by-year", {
      params: { department_id: departmentId, academic_year: year },
    });
    const id = Number(res.data?.id || 0);
    if (id) { localStorage.setItem("raw_template_id", String(id)); setRawTemplateId(id); }
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
        next[t.id] = Object.prototype.hasOwnProperty.call(prev, t.id) ? prev[t.id] : idx < 2;
      });
      return next;
    });
  }

  async function loadForm(templateId, currentTeacherId) {
    if (!templateId) { setTables([]); setStatus("Шаблон не найден"); setStatusKind("error"); return; }
    if (role === "admin" && !currentTeacherId) { setTables([]); setStatus("Выберите преподавателя"); setStatusKind("info"); return; }
    setLoading(true);
    try {
      const params = { raw_template_id: templateId };
      if (role === "admin") params.teacher_id = currentTeacherId;
      const res = await api.get("/manual-fill/form", { params });
      const list = Array.isArray(res.data?.tables) ? res.data.tables : [];
      setTables(list);
      buildInitialStateFromTables(list);
      mergeOpenState(list);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки таблиц");
      setStatusKind("error");
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
      setStatus("Загрузка..."); setStatusKind("info");
      let id = Number(localStorage.getItem("raw_template_id") || 0);
      if (!id || String(localStorage.getItem("academic_year") || "") !== String(nextYear)) {
        id = await resolveRawTemplateIdByYear(nextYear);
      }
      if (!id) { setStatus("Шаблон для этого года не найден"); setStatusKind("error"); setTables([]); return; }
      setRawTemplateId(id);
      await loadForm(id, nextTeacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
      setStatusKind("error");
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
      setAcademicYear(nextYear); setRawTemplateId(nextTemplateId); setTeacherId(nextTeacherId);
      loadTeachers(nextTeacherId);
      reloadCurrent(nextYear, nextTeacherId);
    };

    window.addEventListener("focus", refresh);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  useEffect(() => {
    if (role === "admin" && teacherId && rawTemplateId) loadForm(rawTemplateId, teacherId);
  }, [teacherId]);

  async function handleChangeYear(nextYear) {
    setAcademicYear(nextYear);
    localStorage.setItem("academic_year", nextYear);
    localStorage.removeItem("raw_template_id");
    setRawTemplateId(0);
    setOpenTableIds({});
    try {
      setStatus("Загрузка..."); setStatusKind("info");
      const id = await resolveRawTemplateIdByYear(nextYear);
      if (!id) { setTables([]); setStatus("Шаблон для этого года не найден"); setStatusKind("error"); return; }
      await loadForm(id, teacherId);
    } catch (e) { console.error(e); setStatus(e?.response?.data?.detail || "Ошибка переключения года"); setStatusKind("error"); }
  }

  function toggleOpen(tableId) {
    setOpenTableIds((prev) => ({ ...prev, [tableId]: !prev[tableId] }));
  }

  function setStaticValue(rawCellId, value) {
    setFormValues((prev) => ({ ...prev, [rawCellId]: value }));
  }

  function getLoopRowValue(loopRowId, colIndex) {
    return loopValues?.[loopRowId]?.[colIndex] ?? "";
  }

  function setLoopRowValue(loopRowId, colIndex, value) {
    setLoopValues((prev) => ({
      ...prev,
      [loopRowId]: { ...(prev[loopRowId] || {}), [colIndex]: value },
    }));
  }

  async function saveStaticTable(table) {
    try {
      setSavingStaticTableId(table.id);
      setStatus("Сохранение..."); setStatusKind("info");
      const values = (table.editable_values || []).map((item) => ({
        raw_cell_id: item.raw_cell_id,
        value: formValues[item.raw_cell_id] ?? "",
      }));
      await api.post("/manual-fill/save-static", {
        raw_template_id: rawTemplateId,
        teacher_id: role === "admin" ? teacherId : undefined,
        values,
      });
      setStatus("Сохранено успешно"); setStatusKind("success");
      setTimeout(() => setStatus(""), 2500);
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка сохранения"); setStatusKind("error");
    } finally { setSavingStaticTableId(0); }
  }

  async function addLoopRow(table) {
    try {
      setAddingLoopTableId(table.id);
      const currentRows = Array.isArray(tableLoopRows[table.id]) ? tableLoopRows[table.id] : [];
      const nextRowOrder = currentRows.length > 0 ? Math.max(...currentRows.map((r) => Number(r.row_order) || 0)) + 1 : 1;
      const tmpId = makeTempLoopRowId();
      setTableLoopRows((prev) => ({
        ...prev,
        [table.id]: [...(prev[table.id] || []), {
          loop_row_id: tmpId,
          persisted_loop_row_id: null,
          row_order: nextRowOrder,
          isNew: true,
          isPrefilled: false,
          values: [],
        }],
      }));
      setLoopValues((prev) => ({ ...prev, [tmpId]: {} }));
      setStatus("");
    } catch (e) { console.error(e); setStatus("Ошибка добавления строки"); setStatusKind("error"); }
    finally { setAddingLoopTableId(0); }
  }

  async function ensurePersistedLoopRow(table, row) {
    if (row.persisted_loop_row_id) return row.persisted_loop_row_id;
    const res = await api.post("/manual-fill/add-loop-row", {
      raw_template_id: rawTemplateId,
      raw_table_id: table.id,
      teacher_id: role === "admin" ? teacherId : undefined,
    });
    const newLoopRowId = res.data?.loop_row_id;
    if (!newLoopRowId) throw new Error("Не удалось создать строку на сервере");
    const oldClientId = row.loop_row_id;
    setTableLoopRows((prev) => ({
      ...prev,
      [table.id]: (prev[table.id] || []).map((r) =>
        r.loop_row_id === oldClientId ? { ...r, persisted_loop_row_id: newLoopRowId, isNew: false } : r
      ),
    }));
    setLoopValues((prev) => ({ ...prev, [newLoopRowId]: prev[oldClientId] || {} }));
    return newLoopRowId;
  }

  async function _persistAndSaveRow(table, row) {
    const clientId = row.persisted_loop_row_id || row.loop_row_id;
    const values = Array.from({ length: Number(table.col_count || 0) }).map((_, colIndex) => ({
      col_index: colIndex,
      value: getLoopRowValue(clientId, colIndex),
      column_hint_text: table.column_hints?.[colIndex] || `Колонка ${colIndex + 1}`,
      semantic_key: null,
      stable_column_key: table.stable_column_keys?.[colIndex] || null,
    }));
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
      setStatus("Сохранение..."); setStatusKind("info");
      for (const row of rows) await _persistAndSaveRow(table, row);
      setStatus("Сохранено успешно"); setStatusKind("success");
      setTimeout(() => setStatus(""), 2500);
      await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || e?.message || "Ошибка сохранения"); setStatusKind("error");
    } finally { setSavingLoopTableId(0); }
  }

  async function deleteLoopRow(row, tableId) {
    const ok = window.confirm("Удалить эту строку?");
    if (!ok) return;
    try {
      setDeletingLoopRowId(String(row.loop_row_id));
      setStatus("Удаление..."); setStatusKind("info");
      if (!row.persisted_loop_row_id) {
        setTableLoopRows((prev) => ({
          ...prev,
          [tableId]: (prev[tableId] || []).filter((r) => r.loop_row_id !== row.loop_row_id),
        }));
        setLoopValues((prev) => { const next = { ...prev }; delete next[row.loop_row_id]; return next; });
        setStatus(""); return;
      }
      await api.delete(`/manual-fill/loop-row/${row.persisted_loop_row_id}`, {
        params: { teacher_id: role === "admin" ? teacherId : undefined },
      });
      setStatus(""); await loadForm(rawTemplateId, teacherId);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка удаления строки"); setStatusKind("error");
    } finally { setDeletingLoopRowId(""); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const statusColors = {
    info:    { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d" },
    error:   { bg: "#fef2f2", border: "#fecaca", color: "#dc2626" },
  };
  const sc = statusColors[statusKind] || statusColors.info;

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        .mtp-table-card { transition: box-shadow 0.18s ease; }
        .mtp-table-card:hover { box-shadow: 0 6px 24px rgba(15,23,42,0.09) !important; }
        .mtp-row-card:hover { background: #f8faff !important; }
        .mtp-del-btn:hover { background: #fef2f2 !important; border-color: #fca5a5 !important; }
        .mtp-ctrl-input { transition: border-color 0.15s, box-shadow 0.15s; }
        .mtp-ctrl-input:focus { border-color: rgba(47,107,255,0.5) !important; box-shadow: 0 0 0 3px rgba(47,107,255,0.12) !important; }
        .mtp-input { transition: border-color 0.15s, box-shadow 0.15s; }
        .mtp-input:focus { border-color: rgba(47,107,255,0.5) !important; box-shadow: 0 0 0 3px rgba(47,107,255,0.12) !important; }
        .mtp-open-btn { transition: all 0.15s ease; }
        .mtp-open-btn:hover { background: #f0f5ff !important; border-color: #c7d9fa !important; }
      `}</style>

      <div className="container" style={{ maxWidth: 1140, paddingTop: 28, paddingBottom: 56 }}>

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,#2f6bff,#1a46d3)",
              display: "grid", placeItems: "center", color: "#fff", flexShrink: 0,
              boxShadow: "0 4px 12px rgba(47,107,255,0.28)"
            }}>
              <IconTable />
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>
              Заполнение разделов
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "#64748b", paddingLeft: 46 }}>
            {tables.length > 0
              ? `${tables.length} ${tables.length === 1 ? "таблица" : tables.length < 5 ? "таблицы" : "таблиц"} · учебный год ${academicYear}`
              : "Ручное заполнение таблиц ИПП"}
          </p>
        </div>

        {/* ── Control panel ────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end",
          padding: "16px 20px", borderRadius: 14, border: "1px solid #e2e8f0",
          background: "#fff", boxShadow: "0 2px 8px rgba(15,23,42,0.05)", marginBottom: 28,
        }}>
          {/* Year */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Учебный год
            </label>
            <input
              className="mtp-ctrl-input"
              value={academicYear}
              onChange={(e) => handleChangeYear(e.target.value)}
              placeholder="2025-2026"
              style={{
                height: 40, borderRadius: 9, border: "1px solid #d1d9e6",
                background: "#fff", color: "#0f172a", fontSize: 14, fontWeight: 600,
                padding: "0 12px", outline: "none", width: "100%",
              }}
            />
          </div>

          {/* Teacher selector (admin only) */}
          {role === "admin" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 280, flex: "1 1 280px" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Преподаватель
              </label>
              <select
                className="mtp-ctrl-input"
                value={teacherId ? String(teacherId) : ""}
                onChange={(e) => {
                  const v = Number(e.target.value || 0);
                  setTeacherId(v);
                  localStorage.setItem("teacher_id", String(v));
                }}
                style={{
                  height: 40, borderRadius: 9, border: "1px solid #d1d9e6",
                  background: "#fff", color: "#0f172a", fontSize: 14, fontWeight: 600,
                  padding: "0 12px", outline: "none", width: "100%", cursor: "pointer",
                }}
              >
                {!teachers.length ? (
                  <option value="">Нет преподавателей</option>
                ) : (
                  teachers.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.full_name}</option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Status badge */}
          {(loading || status) && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "0 14px", height: 40, borderRadius: 9,
              background: loading ? "#f0f6ff" : sc.bg,
              border: `1px solid ${loading ? "#bfdbfe" : sc.border}`,
              color: loading ? "#1d4ed8" : sc.color,
              fontSize: 13, fontWeight: 600,
              animation: "fadeIn 0.2s ease",
            }}>
              {loading && <IconSpinner />}
              {loading ? "Загрузка..." : status}
            </div>
          )}
        </div>

        {/* ── Empty state ───────────────────────────────────────────────────── */}
        {!tables.length && !loading && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 14, padding: "64px 24px", textAlign: "center",
            background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
          }}>
            <IconEmpty />
            <div style={{ fontSize: 16, fontWeight: 700, color: "#334155" }}>
              {status || "Нет таблиц для заполнения"}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              Проверьте, загружен ли шаблон для выбранного учебного года
            </div>
          </div>
        )}

        {/* ── Loading skeleton ──────────────────────────────────────────────── */}
        {loading && !tables.length && (
          <div style={{ display: "grid", gap: 12 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{
                height: 82, borderRadius: 14, background: "#f1f5f9",
                animation: `pulse ${0.9 + i * 0.15}s ease-in-out infinite alternate`,
              }} />
            ))}
          </div>
        )}

        {/* ── Sections ──────────────────────────────────────────────────────── */}
        {groupedSections.map((section) => (
          <div key={section.sectionTitle} style={{ marginBottom: 36 }}>

            {/* Section header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
              paddingBottom: 12, borderBottom: "2px solid #e8eef8",
            }}>
              <div style={{
                height: 20, width: 4, borderRadius: 4,
                background: "linear-gradient(180deg,#2f6bff,#1a46d3)",
                flexShrink: 0,
              }} />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>
                {section.sectionTitle}
              </h2>
              <span style={{
                marginLeft: 2, fontSize: 12, fontWeight: 700, color: "#2f6bff",
                background: "#eff6ff", border: "1px solid #bfdbfe",
                borderRadius: 999, padding: "2px 9px",
              }}>
                {section.items.length}
              </span>
            </div>

            {/* Table cards grid */}
            <div style={{ display: "grid", gap: 10 }}>
              {section.items.map((table) => {
                const isOpen = !!openTableIds[table.id];
                const loopRowCount = (tableLoopRows[table.id] || []).length;

                return (
                  <div
                    key={table.id}
                    className="mtp-table-card"
                    style={{
                      borderRadius: 14, overflow: "hidden",
                      border: isOpen ? "1px solid #bdd0f7" : "1px solid #e2e8f0",
                      background: "#fff",
                      boxShadow: isOpen
                        ? "0 8px 28px rgba(15,23,42,0.08)"
                        : "0 2px 6px rgba(15,23,42,0.04)",
                    }}
                  >
                    {/* Card header */}
                    <button
                      onClick={() => toggleOpen(table.id)}
                      style={{
                        width: "100%", display: "flex", gap: 14, alignItems: "center",
                        justifyContent: "space-between", padding: "14px 16px",
                        background: isOpen ? "#f5f9ff" : "#fff",
                        border: "none", cursor: "pointer", textAlign: "left",
                        borderBottom: isOpen ? "1px solid #deeaf9" : "none",
                        transition: "background 0.18s ease",
                      }}
                    >
                      {/* Left: number + info */}
                      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                        {/* Index badge */}
                        <div style={{
                          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                          background: isOpen
                            ? "linear-gradient(135deg,#2f6bff,#1a46d3)"
                            : "linear-gradient(135deg,#dbe8fd,#c3d8fa)",
                          color: isOpen ? "#fff" : "#2f5cb8",
                          display: "grid", placeItems: "center",
                          fontSize: 14, fontWeight: 800,
                          boxShadow: isOpen ? "0 4px 10px rgba(47,107,255,0.28)" : "none",
                          transition: "all 0.18s ease",
                        }}>
                          {String(Number(table.table_index) + 1).padStart(2, "0")}
                        </div>

                        {/* Title + badges */}
                        <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", lineHeight: 1.2 }}>
                            Таблица {Number(table.table_index) + 1}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            {table.excel_bound ? (
                              <TypeBadge type="excel" />
                            ) : (
                              <TypeBadge type="manual" />
                            )}
                            {table.prefill?.found && (
                              <PrefillBadge year={table.prefill.source_academic_year} />
                            )}
                            {table.table_type === "loop" && loopRowCount > 0 && (
                              <span style={{
                                fontSize: 11, fontWeight: 700, borderRadius: 999,
                                padding: "2px 8px", color: "#15803d",
                                background: "#f0fdf4", border: "1px solid #bbf7d0",
                              }}>
                                {loopRowCount} {loopRowCount === 1 ? "строка" : loopRowCount < 5 ? "строки" : "строк"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: expand icon */}
                      <div style={{
                        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                        display: "grid", placeItems: "center",
                        color: isOpen ? "#2f6bff" : "#64748b",
                        background: isOpen ? "#deeaff" : "#f1f5f9",
                        border: isOpen ? "1px solid #bdd0f7" : "1px solid #e2e8f0",
                        transition: "all 0.18s ease",
                      }}>
                        <IconChevron open={isOpen} />
                      </div>
                    </button>

                    {/* Card body */}
                    {isOpen && (
                      <div style={{ padding: "18px 16px", background: "#f8faff" }}>
                        {table.table_type === "static" ? (
                          <>
                            <StaticTableGrid
                              table={table}
                              formValues={formValues}
                              onChange={setStaticValue}
                              readOnly={!!table.excel_bound}
                            />
                            {!table.excel_bound && (
                              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                                <button
                                  className="btn btn-primary"
                                  onClick={() => saveStaticTable(table)}
                                  disabled={savingStaticTableId === table.id}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 7,
                                    height: 40, borderRadius: 9, fontWeight: 700,
                                    padding: "0 20px", boxShadow: "0 4px 14px rgba(47,107,255,0.22)",
                                    cursor: savingStaticTableId === table.id ? "not-allowed" : "pointer",
                                    opacity: savingStaticTableId === table.id ? 0.75 : 1,
                                  }}
                                >
                                  {savingStaticTableId === table.id ? <IconSpinner /> : <IconSave />}
                                  {savingStaticTableId === table.id ? "Сохранение..." : "Сохранить"}
                                </button>
                              </div>
                            )}
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
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Badge components ─────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const isExcel = type === "excel";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
      color: isExcel ? "#475569" : "#1d4ed8",
      background: isExcel ? "#f8fafc" : "#eff6ff",
      border: `1px solid ${isExcel ? "#cbd5e1" : "#bfdbfe"}`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: isExcel ? "#94a3b8" : "#3b82f6", flexShrink: 0,
      }} />
      {isExcel ? "Excel" : "Ручной"}
    </span>
  );
}

function PrefillBadge({ year }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
      color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0",
    }}>
      ↑ {year}
    </span>
  );
}

// ─── Row compression for static table ────────────────────────────────────────

function compressRow(row) {
  const out = [];
  let i = 0;
  while (i < row.length) {
    const cell = row[i];
    const text = String(cell?.text || "").trim();
    const editable = !!cell?.editable;
    if (editable || !text) { out.push({ type: "cell", cell, span: 1 }); i++; continue; }
    let span = 1;
    let j = i + 1;
    while (j < row.length) {
      const next = row[j];
      if (!!next?.editable) break;
      if (String(next?.text || "").trim() !== text) break;
      span++; j++;
    }
    out.push({ type: "cell", cell, span });
    i = j;
  }
  return out;
}

// ─── StaticTableGrid ──────────────────────────────────────────────────────────

function StaticTableGrid({ table, formValues, onChange, readOnly = false }) {
  const matrix = Array.isArray(table.matrix) ? table.matrix : [];
  const prefillMap = new Map(
    (table.editable_values || [])
      .filter((x) => x.from_previous_year)
      .map((x) => [x.raw_cell_id, true])
  );

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
      <table style={{
        width: "100%", minWidth: 0, tableLayout: "auto",
        borderCollapse: "collapse", margin: 0,
      }}>
        <tbody>
          {matrix.length === 0 ? (
            <tr>
              <td style={{ padding: "32px 16px", color: "#94a3b8", textAlign: "center", fontSize: 14 }}>
                Нет данных
              </td>
            </tr>
          ) : matrix.map((row, rowIndex) => {
            const compressed = compressRow(row);
            const isHeader = rowIndex === 0;
            return (
              <tr key={`row-${rowIndex}`} style={{ background: isHeader ? "#f0f6ff" : rowIndex % 2 === 0 ? "#fff" : "#fafbfd" }}>
                {compressed.map((item, idx) => {
                  const cell = item.cell;
                  return (
                    <td
                      key={`${cell.cell_key}-${idx}`}
                      colSpan={item.span}
                      style={{
                        verticalAlign: "top",
                        borderBottom: "1px solid #edf1f7",
                        borderRight: "1px solid #edf1f7",
                        padding: cell.editable ? 8 : "9px 12px",
                        minWidth: cell.editable ? 130 : 80,
                      }}
                    >
                      {cell.editable ? (
                        <div>
                          {prefillMap.get(cell.raw_cell_id) && (
                            <div style={{ marginBottom: 4, fontSize: 10, fontWeight: 800, color: "#15803d", letterSpacing: "0.02em" }}>
                              ↑ ИЗ ПРОШЛОГО ГОДА
                            </div>
                          )}
                          {readOnly ? (
                            <div style={{
                              minHeight: 34, padding: "7px 10px", borderRadius: 7,
                              border: "1px solid #e2e8f0", background: "#f8fafc",
                              color: "#0f172a", fontWeight: 600, fontSize: 13,
                              overflowWrap: "anywhere",
                            }}>
                              {formValues[cell.raw_cell_id] || "—"}
                            </div>
                          ) : (
                            <input
                              className="mtp-input"
                              value={formValues[cell.raw_cell_id] ?? ""}
                              onChange={(e) => onChange(cell.raw_cell_id, e.target.value)}
                              placeholder="—"
                              style={{
                                width: "100%", height: 34, borderRadius: 7,
                                border: "1px solid #d1d9e6", background: "#fff",
                                color: "#0f172a", fontSize: 13, fontWeight: 500,
                                padding: "0 10px", outline: "none",
                              }}
                            />
                          )}
                        </div>
                      ) : (
                        <div style={{
                          whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.4, color: "#1e293b",
                          fontWeight: isHeader ? 700 : 500,
                          overflowWrap: "anywhere", wordBreak: "break-word",
                        }}>
                          {cell.text || ""}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── LoopTablePreview ─────────────────────────────────────────────────────────

function LoopTablePreview({ table, rows, getLoopRowValue }) {
  const colCount = Math.max(0, Number(table.col_count || 0));

  if (!rows?.length || !colCount) {
    return (
      <div style={{
        padding: "28px 16px", borderRadius: 10, border: "1px solid #e2e8f0",
        background: "#fff", color: "#94a3b8", textAlign: "center", fontSize: 14, fontWeight: 600,
      }}>
        Нет данных
      </div>
    );
  }

  const hints = Array.from({ length: colCount }).map((_, i) => table.column_hints?.[i] || `Колонка ${i + 1}`);

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: colCount * 120 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 44 }}>#</th>
            {hints.map((h, i) => (
              <th key={i} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowId = row.persisted_loop_row_id || row.loop_row_id;
            return (
              <tr key={String(rowId ?? rowIndex)} style={{ background: rowIndex % 2 === 0 ? "#fff" : "#f8fafd" }}>
                <td style={{ ...tdStyle, color: "#94a3b8", fontWeight: 600, fontSize: 12, textAlign: "center" }}>
                  {rowIndex + 1}
                </td>
                {Array.from({ length: colCount }).map((_, colIndex) => (
                  <td key={colIndex} style={tdStyle}>
                    {getLoopRowValue(rowId, colIndex) || <span style={{ color: "#cbd5e1" }}>—</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#475569",
  background: "#f0f6ff", borderBottom: "2px solid #dde8f8",
  textAlign: "left", whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "10px 14px", fontSize: 13, color: "#1e293b", fontWeight: 500,
  borderBottom: "1px solid #edf2f9", verticalAlign: "middle", whiteSpace: "pre-wrap",
  overflowWrap: "anywhere", wordBreak: "break-word",
};

// ─── LoopTableEditor ──────────────────────────────────────────────────────────

function LoopTableEditor({
  table, rows, getLoopRowValue, setLoopRowValue,
  onAddRow, onSaveTable, onDeleteRow,
  addingLoopTableId, savingThisTable, deletingLoopRowId,
}) {
  const colCount = Number(table.col_count || 0);
  const hints = Array.from({ length: colCount }).map((_, i) => table.column_hints?.[i] || `Колонка ${i + 1}`);

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        marginBottom: rows?.length ? 14 : 0,
        padding: "10px 14px", borderRadius: 10,
        background: "#fff", border: "1px solid #e2e8f0",
      }}>
        <button
          className="btn btn-outline"
          onClick={onAddRow}
          disabled={addingLoopTableId === table.id}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 36, borderRadius: 8, fontWeight: 700, fontSize: 13,
            padding: "0 14px", boxShadow: "none",
            cursor: addingLoopTableId === table.id ? "not-allowed" : "pointer",
            opacity: addingLoopTableId === table.id ? 0.7 : 1,
          }}
        >
          {addingLoopTableId === table.id ? <IconSpinner /> : <IconPlus />}
          {addingLoopTableId === table.id ? "Добавление..." : "Добавить строку"}
        </button>

        <button
          className="btn btn-primary"
          onClick={onSaveTable}
          disabled={savingThisTable || !rows?.length}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 36, borderRadius: 8, fontWeight: 700, fontSize: 13,
            padding: "0 18px", boxShadow: "0 4px 12px rgba(47,107,255,0.22)",
            background: savingThisTable ? undefined : "#1a7f52",
            borderColor: savingThisTable ? undefined : "#1a7f52",
            cursor: (savingThisTable || !rows?.length) ? "not-allowed" : "pointer",
            opacity: !rows?.length ? 0.5 : 1,
          }}
        >
          {savingThisTable ? <IconSpinner /> : <IconSave />}
          {savingThisTable ? "Сохранение..." : "Сохранить таблицу"}
        </button>

        {rows?.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#64748b" }}>
            {rows.length} {rows.length === 1 ? "строка" : rows.length < 5 ? "строки" : "строк"}
          </span>
        )}
      </div>

      {/* Empty state */}
      {!rows?.length && (
        <div style={{
          marginTop: 14, padding: "28px 16px", borderRadius: 10,
          border: "2px dashed #d1d9e6", background: "#f8fafc",
          color: "#94a3b8", textAlign: "center", fontSize: 13, fontWeight: 600,
        }}>
          Нет строк — нажмите «Добавить строку», чтобы начать
        </div>
      )}

      {/* Table layout for rows */}
      {rows?.length > 0 && colCount > 0 && (
        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: colCount * 140 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 44, textAlign: "center" }}>#</th>
                {hints.map((h, i) => (
                  <th key={i} style={{ ...thStyle, minWidth: 130 }}>{h}</th>
                ))}
                <th style={{ ...thStyle, width: 90, textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const clientId = row.persisted_loop_row_id || row.loop_row_id;
                const isDeleting = deletingLoopRowId === String(row.loop_row_id);

                return (
                  <tr
                    key={String(row.loop_row_id)}
                    className="mtp-row-card"
                    style={{
                      background: row.isNew ? "#f0fdf4" : rowIndex % 2 === 0 ? "#fff" : "#f8fafd",
                      opacity: isDeleting ? 0.5 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: "center", color: "#94a3b8", fontWeight: 700, fontSize: 12, verticalAlign: "middle" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <span>{rowIndex + 1}</span>
                        {row.isPrefilled && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: "#15803d", letterSpacing: "0.03em" }}>↑ ПГ</span>
                        )}
                      </div>
                    </td>

                    {Array.from({ length: colCount }).map((_, colIndex) => (
                      <td key={colIndex} style={{ ...tdStyle, padding: "8px 10px", verticalAlign: "middle" }}>
                        <input
                          className="mtp-input"
                          value={getLoopRowValue(clientId, colIndex)}
                          onChange={(e) => setLoopRowValue(clientId, colIndex, e.target.value)}
                          placeholder="—"
                          style={{
                            width: "100%", height: 34, borderRadius: 7,
                            border: "1px solid #d1d9e6", background: "#fff",
                            color: "#0f172a", fontSize: 13, fontWeight: 500,
                            padding: "0 10px", outline: "none",
                          }}
                        />
                      </td>
                    ))}

                    <td style={{ ...tdStyle, textAlign: "center", padding: "8px 10px", verticalAlign: "middle" }}>
                      <button
                        className="mtp-del-btn"
                        onClick={() => onDeleteRow(row)}
                        disabled={isDeleting}
                        title="Удалить строку"
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                          height: 32, width: 32, borderRadius: 7,
                          border: "1px solid #fca5a5", background: "#fff",
                          color: "#dc2626", cursor: isDeleting ? "not-allowed" : "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {isDeleting ? <IconSpinner /> : <IconTrash />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
