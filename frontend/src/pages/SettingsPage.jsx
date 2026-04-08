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
    return (excelTemplates || []).find((t) => String(t.academic_year) === String(academicYear)) || null;
  }, [excelTemplates, academicYear]);

  async function loadExcelTemplates() {
    try {
      const res = await api.get("/excel/templates", {
        params: { department_id: departmentId },
      });
      setExcelTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка загрузки Excel");
    }
  }

  async function loadColumns(exId) {
    try {
      const res = await api.get(`/excel/${exId}/columns`);
      setCols(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setCols([]);
      setStatus(e?.response?.data?.detail || "Ошибка загрузки колонок");
    }
  }

  async function loadRawTables() {
    try {
      const res = await api.get("/raw-template/by-year", {
        params: {
          department_id: departmentId,
          academic_year: academicYear,
        },
      });

      const rawTemplateId = res.data?.id;
      if (!rawTemplateId) {
        setTables([]);
        return;
      }

      localStorage.setItem("raw_template_id", String(rawTemplateId));

      const t = await api.get(`/raw-template/${rawTemplateId}/tables`);
      setTables(Array.isArray(t.data?.tables) ? t.data.tables : []);
    } catch {
      setTables([]);
    }
  }

  async function loadSettings() {
    try {
      const res = await api.get("/settings/current", {
        params: {
          department_id: departmentId,
          academic_year: academicYear,
        },
      });

      if (res.data?.exists && res.data?.config) {
        const loaded = res.data.config;

        setCfg((prev) => ({
          ...prev,
          columns: {
            ...prev.columns,
            ...(loaded.columns || {}),
          },
          activity_types: {
            ...prev.activity_types,
            ...(loaded.activity_types || {}),
          },
          merge_rules: {
            ...prev.merge_rules,
            ...(loaded.merge_rules || {}),
            sum_cols_by_type: {
              ...prev.merge_rules.sum_cols_by_type,
              ...(loaded.merge_rules?.sum_cols_by_type || {}),
            },
          },
          template_bindings: {
            teaching_load: {
              staff: loaded.template_bindings?.teaching_load?.staff || {},
              hourly: loaded.template_bindings?.teaching_load?.hourly || {},
            },
          },
        }));
      }
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка загрузки настроек");
    }
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
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка сохранения");
    }
  }

  function setCol(key, value) {
    setCfg((prev) => ({
      ...prev,
      columns: {
        ...prev.columns,
        [key]: value,
      },
    }));
  }

  function setActivityPatterns(typeKey, text) {
    const arr = String(text || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setCfg((prev) => ({
      ...prev,
      activity_types: {
        ...(prev.activity_types || {}),
        [typeKey]: arr,
      },
    }));
  }

  function setMergeRule(key, value) {
    setCfg((prev) => ({
      ...prev,
      merge_rules: {
        ...prev.merge_rules,
        [key]: value,
      },
    }));
  }

  function setMergeRuleArray(key, text) {
    const arr = String(text || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setCfg((prev) => ({
      ...prev,
      merge_rules: {
        ...prev.merge_rules,
        [key]: arr,
      },
    }));
  }

  function setSumColsByType(typeKey, text) {
    const arr = String(text || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

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
    if (!excelForYear) {
      setCols([]);
      setTables([]);
      return;
    }

    const id = excelForYear.id;
    setExcelTemplateId(String(id));

    loadColumns(id);
    loadRawTables();
    loadSettings();
  }, [excelTemplates, academicYear]);

  return (
    <div className="container">
      <div className="page-title">Настройка генерации</div>

      <div className="card card-pad">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <input
            className="input"
            style={{ width: 220 }}
            value={academicYear}
            onChange={(e) => {
              setAcademicYear(e.target.value);
              localStorage.setItem("academic_year", e.target.value);
            }}
            placeholder="2025-2026"
          />

          <div className="small">{status}</div>
        </div>

        <div
          className="card"
          style={{
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(15,23,42,.10)",
            background: "#f8fbff",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Что настраивается здесь
          </div>

          <div className="small" style={{ display: "grid", gap: 6 }}>
            <div>1. Какие колонки Excel использовать для генерации</div>
            <div>2. Какая таблица шаблона является штатной нагрузкой</div>
            <div>3. Какая таблица шаблона является почасовой нагрузкой</div>
            <div>4. Как система объединяет строки и считает часы</div>
          </div>
        </div>

        <div className="hr" />

        <div className="section-title">Маппинг Excel колонок</div>

        <SelectRow
          label="ФИО преподавателя"
          value={cfg.columns.teacher_col}
          cols={cols}
          onChange={(v) => setCol("teacher_col", v)}
        />
        <SelectRow
          label="Штатные часы"
          value={cfg.columns.staff_hours_col}
          cols={cols}
          onChange={(v) => setCol("staff_hours_col", v)}
        />
        <SelectRow
          label="Почасовые часы"
          value={cfg.columns.hourly_hours_col}
          cols={cols}
          onChange={(v) => setCol("hourly_hours_col", v)}
        />
        <SelectRow
          label="Дисциплина"
          value={cfg.columns.discipline_col}
          cols={cols}
          onChange={(v) => setCol("discipline_col", v)}
        />
        <SelectRow
          label="Вид занятий"
          value={cfg.columns.activity_type_col}
          cols={cols}
          onChange={(v) => setCol("activity_type_col", v)}
        />
        <SelectRow
          label="Группа"
          value={cfg.columns.group_col}
          cols={cols}
          onChange={(v) => setCol("group_col", v)}
        />
        <SelectRow
          label="ОП / программа"
          value={cfg.columns.op_col}
          cols={cols}
          onChange={(v) => setCol("op_col", v)}
        />

        <div className="hr" />

        <div className="section-title">Типы занятий</div>

        <TextRow
          label="Лекции"
          value={(cfg.activity_types?.lecture || []).join(", ")}
          onChange={(v) => setActivityPatterns("lecture", v)}
        />
        <TextRow
          label="Лаб/практики"
          value={(cfg.activity_types?.lab_practice || []).join(", ")}
          onChange={(v) => setActivityPatterns("lab_practice", v)}
        />

        <div className="hr" />

        <div className="section-title">Правила объединения</div>

        <TextRow
          label="Ключевые колонки"
          value={(cfg.merge_rules?.key_cols || []).join(", ")}
          onChange={(v) => setMergeRuleArray("key_cols", v)}
        />
        <TextRow
          label="Разделитель групп"
          value={cfg.merge_rules?.group_join || ", "}
          onChange={(v) => setMergeRule("group_join", v)}
        />

        <SelectSimple
          label="Приоритет групп"
          value={cfg.merge_rules?.group_priority_type || "lecture"}
          options={[
            { value: "lecture", label: "Лекции" },
            { value: "lab_practice", label: "Лаб/практики" },
          ]}
          onChange={(v) => setMergeRule("group_priority_type", v)}
        />

        <TextRow
          label="Сумма для лекций"
          value={(cfg.merge_rules?.sum_cols_by_type?.lecture || []).join(", ")}
          onChange={(v) => setSumColsByType("lecture", v)}
        />
        <TextRow
          label="Сумма для лаб/практик"
          value={(cfg.merge_rules?.sum_cols_by_type?.lab_practice || []).join(", ")}
          onChange={(v) => setSumColsByType("lab_practice", v)}
        />

        <div className="hr" />

        <div className="section-title">Привязка таблиц нагрузки</div>

        <TeachingLoadBinding
          label="Таблица штатной нагрузки"
          tables={tables}
          value={cfg.template_bindings?.teaching_load?.staff?.raw_table_id || ""}
          onChange={(v) => setTeachingLoadTable("staff", v)}
        />

        <TeachingLoadBinding
          label="Таблица почасовой нагрузки"
          tables={tables}
          value={cfg.template_bindings?.teaching_load?.hourly?.raw_table_id || ""}
          onChange={(v) => setTeachingLoadTable("hourly", v)}
        />

        <div className="actions-row" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={saveSettings} disabled={!excelTemplateId}>
            СОХРАНИТЬ
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectRow({ label, value, cols, onChange }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: 220 }}>{label}</div>

      <select className="input" style={{ width: 420 }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Выбери колонку</option>
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
    <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: 220 }}>{label}</div>

      <input
        className="input"
        style={{ width: 420 }}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectSimple({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: 220 }}>{label}</div>

      <select className="input" style={{ width: 420 }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TeachingLoadBinding({ label, tables, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: 220 }}>{label}</div>

      <select className="input" style={{ width: 420 }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Выбери таблицу</option>
        {(tables || []).map((t) => (
          <option key={t.id} value={t.id}>
            Таблица {Number(t.table_index) + 1}{t.section_title ? ` — ${t.section_title}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}