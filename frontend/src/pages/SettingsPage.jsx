import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function SettingsPage() {
  const [departmentId] = useState(Number(localStorage.getItem("department_id") || 0));
  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");

  const [excelTemplates, setExcelTemplates] = useState([]);
  const [excelTemplateId, setExcelTemplateId] = useState("");

  const [cols, setCols] = useState([]);
  const [tables, setTables] = useState([]);
  const [status, setStatus] = useState("");

  const [cfg, setCfg] = useState({
    columns: {
      teacher_col: "",
      staff_hours_col: "",
      hourly_hours_col: "",
      discipline_col: "",
      activity_type_col: "",
      group_col: "",
      op_col: "",
    },
    activity_types: {
      lecture: ["лек", "лк", "lecture"],
      lab_practice: ["лаб", "пра", "lab", "pract"],
    },
    merge_rules: {
      key_cols: ["distsiplina", "op"],
      group_join: ", ",
      group_priority_type: "lecture",
      sum_cols_by_type: {
        lecture: ["l", "srsp", "ekzameny"],
        lab_practice: ["spz", "lz", "rk_1_2"],
      },
    },
    template_bindings: {
      teaching_load: {
        staff: {},
        hourly: {},
      },
    },
  });

  const excelForYear = useMemo(() => {
    return (
      excelTemplates.find(
        (t) => String(t.academic_year) === String(academicYear)
      ) || null
    );
  }, [excelTemplates, academicYear]);

  async function loadExcelTemplates() {
    try {
      const res = await api.get("/excel/templates", {
        params: { department_id: departmentId },
      });
      setExcelTemplates(res.data || []);
    } catch (e) {
      setStatus("Ошибка загрузки Excel");
    }
  }

  async function loadColumns(exId) {
    try {
      const res = await api.get(`/excel/${exId}/columns`);
      setCols(res.data || []);
    } catch {
      setCols([]);
    }
  }

  async function loadRawTables() {
    try {
      const res = await api.get("/raw-template/by-year", {
        params: { department_id: departmentId, academic_year: academicYear },
      });

      const id = res.data?.id;
      if (!id) return setTables([]);

      const t = await api.get(`/raw-template/${id}/tables`);
      setTables(t.data?.tables || []);
    } catch {
      setTables([]);
    }
  }

  async function loadSettings() {
    try {
      const res = await api.get("/settings/current", {
        params: { department_id: departmentId, academic_year: academicYear },
      });

      if (res.data?.config) {
        const loaded = res.data.config;
        setCfg((prev) => ({
          ...prev,
          ...loaded,
        }));
      }
    } catch {}
  }

  async function saveSettings() {
    try {
      setStatus("Сохранение...");
      await api.post("/settings/save", {
        department_id: departmentId,
        academic_year: academicYear,
        config: cfg,
      });
      setStatus("Сохранено ✅");
    } catch {
      setStatus("Ошибка сохранения");
    }
  }

  function setCol(key, value) {
    setCfg((prev) => ({
      ...prev,
      columns: { ...prev.columns, [key]: value },
    }));
  }

  function setActivityPatterns(typeKey, text) {
    const arr = text.split(",").map((s) => s.trim()).filter(Boolean);
    setCfg((prev) => ({
      ...prev,
      activity_types: { ...prev.activity_types, [typeKey]: arr },
    }));
  }

  function setMergeRule(key, value) {
    setCfg((prev) => ({
      ...prev,
      merge_rules: { ...prev.merge_rules, [key]: value },
    }));
  }

  function setMergeRuleArray(key, text) {
    const arr = text.split(",").map((s) => s.trim()).filter(Boolean);
    setCfg((prev) => ({
      ...prev,
      merge_rules: { ...prev.merge_rules, [key]: arr },
    }));
  }

  function setSumColsByType(typeKey, text) {
    const arr = text.split(",").map((s) => s.trim()).filter(Boolean);
    setCfg((prev) => ({
      ...prev,
      merge_rules: {
        ...prev.merge_rules,
        sum_cols_by_type: {
          ...prev.merge_rules.sum_cols_by_type,
          [typeKey]: arr,
        },
      },
    }));
  }

  function setTeachingLoadTable(loadKind, tableId) {
    setCfg((prev) => ({
      ...prev,
      template_bindings: {
        teaching_load: {
          ...prev.template_bindings.teaching_load,
          [loadKind]: tableId ? { raw_table_id: Number(tableId) } : {},
        },
      },
    }));
  }

  useEffect(() => {
    loadExcelTemplates();
  }, []);

  useEffect(() => {
    if (!excelForYear) return;

    const id = excelForYear.id;
    setExcelTemplateId(String(id));

    loadColumns(id);
    loadRawTables();
    loadSettings();
  }, [excelTemplates, academicYear]);

  return (
    <div className="container" style={{ maxWidth: 1200 }}>
      <h1>Настройка генерации</h1>

      <input
        value={academicYear}
        onChange={(e) => setAcademicYear(e.target.value)}
      />

      <div>{status}</div>

      <h3>Маппинг колонок</h3>

      <SelectRow label="ФИО" value={cfg.columns.teacher_col} cols={cols} onChange={(v) => setCol("teacher_col", v)} />
      <SelectRow label="Штатные часы" value={cfg.columns.staff_hours_col} cols={cols} onChange={(v) => setCol("staff_hours_col", v)} />
      <SelectRow label="Почасовые" value={cfg.columns.hourly_hours_col} cols={cols} onChange={(v) => setCol("hourly_hours_col", v)} />

      <h3>Типы занятий</h3>

      <TextRow label="Лекции" value={cfg.activity_types.lecture.join(", ")} onChange={(v) => setActivityPatterns("lecture", v)} />
      <TextRow label="Лабы" value={cfg.activity_types.lab_practice.join(", ")} onChange={(v) => setActivityPatterns("lab_practice", v)} />

      <h3>Правила</h3>

      <TextRow label="Key cols" value={cfg.merge_rules.key_cols.join(", ")} onChange={(v) => setMergeRuleArray("key_cols", v)} />

      <h3>Таблицы</h3>

      <TeachingLoadBinding label="Штатка" tables={tables} value={cfg.template_bindings.teaching_load.staff.raw_table_id} onChange={(v) => setTeachingLoadTable("staff", v)} />
      <TeachingLoadBinding label="Почасовая" tables={tables} value={cfg.template_bindings.teaching_load.hourly.raw_table_id} onChange={(v) => setTeachingLoadTable("hourly", v)} />

      <button onClick={saveSettings}>СОХРАНИТЬ</button>
    </div>
  );
}

function SelectRow({ label, value, cols, onChange }) {
  return (
    <div>
      <div>{label}</div>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(cols || []).map((c) => (
          <option key={c.column_name} value={c.column_name}>
            {c.header_text}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextRow({ label, value, onChange }) {
  return (
    <div>
      <div>{label}</div>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TeachingLoadBinding({ label, tables, value, onChange }) {
  return (
    <div>
      <div>{label}</div>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Выбери таблицу</option>
        {(tables || []).map((t) => (
          <option key={t.id} value={t.id}>
            Таблица {t.table_index + 1}
          </option>
        ))}
      </select>
    </div>
  );
}