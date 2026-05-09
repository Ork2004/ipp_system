/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const yearFieldStyle = {
  width: 220,
  height: 48,
  borderRadius: 10,
  border: "1px solid #d9e3f5",
  background: "#f8fbff",
  boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
  color: "#17356f",
  fontSize: 16,
  fontWeight: 700,
  padding: "0 14px",
  outline: "none",
  WebkitTextFillColor: "#17356f",
  caretColor: "#17356f",
};

const selectStyle = {
  width: "100%",
  height: 48,
  borderRadius: 10,
  border: "1px solid #d9e3f5",
  background: "#f8fbff",
  padding: "0 12px",
  fontSize: 15,
  color: "#1f2f4d",
  WebkitTextFillColor: "#1f2f4d",
  caretColor: "#1f2f4d",
  outline: "none",
  boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
};

const textInputStyle = {
  ...selectStyle,
  padding: "0 14px",
};

const REQUIRED_COLUMN_KEYS = ["teacher_col", "staff_hours_col"];

const BASIC_COLUMNS = [
  ["teacher_col", "ФИО"],
  ["staff_hours_col", "Штатные часы"],
  ["hourly_hours_col", "Почасовые часы"],
  ["discipline_col", "Дисциплина"],
  ["activity_type_col", "Вид занятий"],
  ["group_col", "Группа"],
  ["op_col", "ОП"],
];

const HOURS_COLUMNS = [
  ["course_col", "Курс"],
  ["academic_period_col", "Период"],
  ["credits_col", "Кредиты"],
  ["student_count_col", "Контингент"],
  ["payment_form_col", "Оплата"],
  ["normative_col", "Норматив"],
  ["lecture_hours_col", "Лекции"],
  ["practice_hours_col", "Практика/семинар"],
  ["lab_hours_col", "Лабораторные"],
  ["srsp_hours_col", "СРСП"],
  ["rk_hours_col", "РК"],
  ["exam_hours_col", "Экзамен"],
  ["practice_load_col", "Практика"],
  ["diploma_load_col", "ДП/МД"],
  ["research_load_col", "НИР"],
  ["other_load_col", "ДВР"],
  ["total_col", "Итого"],
];

const STEPS = [
  { id: "basic", title: "Колонки", hint: "ФИО и часы" },
  { id: "hours", title: "Часы", hint: "Нагрузка" },
  { id: "rules", title: "Правила", hint: "Поиск строк" },
  { id: "tables", title: "Таблицы", hint: "Источник данных" },
];

function createDefaultConfig() {
  return {
    columns: {
      teacher_col: "",
      staff_hours_col: "",
      hourly_hours_col: "",
      discipline_col: "",
      activity_type_col: "",
      group_col: "",
      op_col: "",
      course_col: "",
      academic_period_col: "",
      credits_col: "",
      student_count_col: "",
      payment_form_col: "",
      normative_col: "",
      lecture_hours_col: "",
      practice_hours_col: "",
      lab_hours_col: "",
      srsp_hours_col: "",
      rk_hours_col: "",
      exam_hours_col: "",
      practice_load_col: "",
      diploma_load_col: "",
      research_load_col: "",
      other_load_col: "",
      total_col: "",
    },
    activity_types: {
      lecture: ["лек", "лк", "lecture"],
      lab_practice: ["лаб", "пра", "lab", "pract"],
    },
    merge_rules: {
      key_cols: ["discipline", "op"],
      group_join: ", ",
      group_priority_type: "lecture",
      sum_cols_by_type: {
        lecture: ["l", "srsp", "ekzameny"],
        lab_practice: ["spz", "lz", "rk_1_2"],
      },
    },
    special_workload_patterns: {
      practika: [],
      diploma_supervision: [],
      research_work: [],
      other_work: [],
    },
    template_bindings: {
      teaching_load: {
        staff: { source: "excel" },
        hourly: { source: "excel" },
        summary: { source: "excel" },
      },
      performance_summary: { source: "excel" },
    },
  };
}

function mergeConfig(baseConfig, loadedConfig = {}) {
  const base = createDefaultConfig();
  const loaded = loadedConfig || {};
  const mergedSummaryBinding = {
    ...base.template_bindings.teaching_load.summary,
    ...(baseConfig?.template_bindings?.teaching_load_summary || {}),
    ...(loaded.template_bindings?.teaching_load_summary || {}),
    ...(baseConfig?.template_bindings?.teaching_load?.summary || {}),
    ...(loaded.template_bindings?.teaching_load?.summary || {}),
  };
  const mergedPerformanceSummaryBinding = {
    ...base.template_bindings.performance_summary,
    ...(baseConfig?.template_bindings?.individual_plan_performance || {}),
    ...(loaded.template_bindings?.individual_plan_performance || {}),
    ...(baseConfig?.template_bindings?.performance_summary || {}),
    ...(loaded.template_bindings?.performance_summary || {}),
  };

  return {
    ...base,
    ...baseConfig,
    ...loaded,
    columns: {
      ...base.columns,
      ...(baseConfig?.columns || {}),
      ...(loaded.columns || {}),
    },
    activity_types: {
      ...base.activity_types,
      ...(baseConfig?.activity_types || {}),
      ...(loaded.activity_types || {}),
    },
    merge_rules: {
      ...base.merge_rules,
      ...(baseConfig?.merge_rules || {}),
      ...(loaded.merge_rules || {}),
      sum_cols_by_type: {
        ...base.merge_rules.sum_cols_by_type,
        ...(baseConfig?.merge_rules?.sum_cols_by_type || {}),
        ...(loaded.merge_rules?.sum_cols_by_type || {}),
      },
    },
    special_workload_patterns: {
      ...base.special_workload_patterns,
      ...(baseConfig?.special_workload_patterns || {}),
      ...(loaded.special_workload_patterns || {}),
    },
    template_bindings: {
      ...base.template_bindings,
      ...(baseConfig?.template_bindings || {}),
      ...(loaded.template_bindings || {}),
      performance_summary: mergedPerformanceSummaryBinding,
      teaching_load: {
        ...base.template_bindings.teaching_load,
        ...(baseConfig?.template_bindings?.teaching_load || {}),
        ...(loaded.template_bindings?.teaching_load || {}),
        summary: mergedSummaryBinding,
      },
    },
  };
}

function findPerformanceSummaryTableId(tables) {
  const markers = [
    "оқытушының джж орындау қорытындысы",
    "джж орындау қорытындысы",
    "итоги выполнения ип работы преподавателя",
    "teacher’s individual plan performance",
    "teacher's individual plan performance",
    "individual plan performance",
  ];

  const table = (tables || []).find((t) => {
    const haystack = [
      t.section_title,
      t.header_signature,
      ...(Array.isArray(t.column_hints) ? t.column_hints : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return markers.some((marker) => haystack.includes(marker));
  });

  return table?.id ? Number(table.id) : undefined;
}

function applyInferredTableBindings(config, tables) {
  const currentBinding = config?.template_bindings?.performance_summary || {};
  if (currentBinding.raw_table_id) return config;

  const inferredRawTableId = findPerformanceSummaryTableId(tables);
  if (!inferredRawTableId) return config;

  return {
    ...config,
    template_bindings: {
      ...(config.template_bindings || {}),
      performance_summary: {
        source: "excel",
        ...currentBinding,
        raw_table_id: inferredRawTableId,
      },
    },
  };
}

export default function SettingsPage() {
  const [departmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );
  const [activeStep, setActiveStep] = useState("basic");

  const [excelTemplates, setExcelTemplates] = useState([]);
  const [excelTemplateId, setExcelTemplateId] = useState("");
  const [cols, setCols] = useState([]);
  const [tables, setTables] = useState([]);
  const [status, setStatus] = useState("");
  const [cfg, setCfg] = useState(() => createDefaultConfig());

  const excelForYear = useMemo(() => {
    return (
      excelTemplates.find(
        (t) => String(t.academic_year) === String(academicYear)
      ) || null
    );
  }, [excelTemplates, academicYear]);

  const missingRequired = REQUIRED_COLUMN_KEYS.filter((key) => !cfg.columns[key]);
  const requiredReady = REQUIRED_COLUMN_KEYS.length - missingRequired.length;
  const cfgWithTableDefaults = useMemo(
    () => applyInferredTableBindings(cfg, tables),
    [cfg, tables]
  );

  async function loadExcelTemplates() {
    try {
      const res = await api.get("/excel/templates", {
        params: { department_id: departmentId },
      });
      setExcelTemplates(Array.isArray(res.data) ? res.data : []);
    } catch {
      setStatus("Ошибка загрузки Excel");
      setExcelTemplates([]);
    }
  }

  async function loadColumns(exId) {
    try {
      const res = await api.get(`/excel/${exId}/columns`);
      setCols(Array.isArray(res.data) ? res.data : []);
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
      if (!id) {
        setTables([]);
        return;
      }

      const t = await api.get(`/raw-template/${id}/tables`);
      setTables(Array.isArray(t.data?.tables) ? t.data.tables : []);
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
        setCfg(mergeConfig(createDefaultConfig(), res.data.config));
        return;
      }

      setCfg(createDefaultConfig());
    } catch {
      setCfg(createDefaultConfig());
    }
  }

  async function saveSettings() {
    try {
      if (missingRequired.length) {
        setStatus("Заполните обязательные колонки");
        setActiveStep("basic");
        return;
      }

      setStatus("Сохранение...");
      await api.post("/settings/save", {
        department_id: departmentId,
        academic_year: academicYear,
        config: cfgWithTableDefaults,
      });
      setStatus("Сохранено");
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
    setCfg((prev) => ({
      ...prev,
      activity_types: {
        ...prev.activity_types,
        [typeKey]: splitList(text),
      },
    }));
  }

  function setSpecialPatterns(bucketKey, text) {
    setCfg((prev) => ({
      ...prev,
      special_workload_patterns: {
        ...prev.special_workload_patterns,
        [bucketKey]: splitList(text),
      },
    }));
  }

  function setMergeRuleArray(key, text) {
    setCfg((prev) => ({
      ...prev,
      merge_rules: {
        ...prev.merge_rules,
        [key]: splitList(text),
      },
    }));
  }

  function setTeachingLoadBinding(loadKind, patch) {
    setCfg((prev) => ({
      ...prev,
      template_bindings: {
        ...prev.template_bindings,
        teaching_load: {
          ...prev.template_bindings.teaching_load,
          [loadKind]: {
            ...(prev.template_bindings.teaching_load?.[loadKind] || {}),
            ...patch,
          },
        },
      },
    }));
  }

  function setTeachingLoadTable(loadKind, tableId) {
    setTeachingLoadBinding(loadKind, {
      raw_table_id: tableId ? Number(tableId) : undefined,
    });
  }

  function setTeachingLoadSource(loadKind, source) {
    setTeachingLoadBinding(loadKind, {
      source: source === "manual" ? "manual" : "excel",
    });
  }

  function setPerformanceSummaryTable(tableId) {
    setCfg((prev) => ({
      ...prev,
      template_bindings: {
        ...(prev.template_bindings || {}),
        performance_summary: {
          ...(prev.template_bindings?.performance_summary || {}),
          source: "excel",
          raw_table_id: tableId ? Number(tableId) : undefined,
        },
      },
    }));
  }

  function handleYearChange(value) {
    setAcademicYear(value);
    localStorage.setItem("academic_year", value);
  }

  useEffect(() => {
    loadExcelTemplates();
  }, []);

  useEffect(() => {
    localStorage.setItem("academic_year", academicYear);

    if (!excelForYear) {
      setCols([]);
      setTables([]);
      setExcelTemplateId("");
      setCfg(createDefaultConfig());
      return;
    }

    const id = excelForYear.id;
    setExcelTemplateId(String(id));
    loadColumns(id);
    loadRawTables();
    loadSettings();
  }, [excelTemplates, academicYear]);

  return (
    <main className="container" style={{ maxWidth: 1180, paddingTop: 32 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 44,
              lineHeight: 1.05,
              fontWeight: 800,
              color: "#17356f",
            }}
          >
            Настройки
          </div>
          <div style={{ marginTop: 8, color: "#6f83a8", fontWeight: 700 }}>
            {requiredReady}/{REQUIRED_COLUMN_KEYS.length} обязательных
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            style={yearFieldStyle}
            value={academicYear}
            onChange={(e) => handleYearChange(e.target.value)}
            placeholder="2025-2026"
          />
          <button
            className="btn btn-primary"
            onClick={saveSettings}
            disabled={!excelForYear}
            style={{
              minWidth: 140,
              height: 46,
              borderRadius: 10,
              fontWeight: 800,
              boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
            }}
          >
            Сохранить
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr)",
          gap: 18,
        }}
      >
        <aside
          style={{
            background: "#fff",
            border: "1px solid #e4ebf7",
            borderRadius: 14,
            padding: 12,
            alignSelf: "start",
            boxShadow: "0 10px 26px rgba(15, 23, 42, 0.05)",
          }}
        >
          <Meta label="Кафедра" value={departmentId || "—"} />
          <Meta label="Excel" value={excelTemplateId || "—"} />
          <Meta label="Колонок" value={cols.length || "—"} />
          <div className="hr" />
          <div style={{ display: "grid", gap: 8 }}>
            {STEPS.map((step) => (
              <StepButton
                key={step.id}
                step={step}
                active={activeStep === step.id}
                onClick={() => setActiveStep(step.id)}
              />
            ))}
          </div>
        </aside>

        <section
          style={{
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(30,58,138,0.08)",
            borderRadius: 16,
            padding: 22,
            minHeight: 520,
            boxShadow: "0 14px 36px rgba(15, 23, 42, 0.07)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <div style={{ color: "#315fcb", fontWeight: 750, minHeight: 22 }}>
              {status}
            </div>
            {!excelForYear ? (
              <div style={badgeStyle("#b45309", "rgba(180,83,9,0.10)")}>
                Excel не найден
              </div>
            ) : missingRequired.length ? (
              <div style={badgeStyle("#b45309", "rgba(180,83,9,0.10)")}>
                Нужны ФИО и штатные часы
              </div>
            ) : (
              <div style={badgeStyle("#1f8f57", "rgba(31,143,87,0.10)")}>
                Готово
              </div>
            )}
          </div>

          {!excelForYear ? (
            <EmptyState />
          ) : activeStep === "basic" ? (
            <ColumnStep
              title="Колонки Excel"
              fields={BASIC_COLUMNS}
              cols={cols}
              cfg={cfg}
              onChange={setCol}
              requiredKeys={REQUIRED_COLUMN_KEYS}
            />
          ) : activeStep === "hours" ? (
            <ColumnStep
              title="Часы и нагрузка"
              fields={HOURS_COLUMNS}
              cols={cols}
              cfg={cfg}
              onChange={setCol}
              requiredKeys={[]}
            />
          ) : activeStep === "rules" ? (
            <RulesStep
              cfg={cfg}
              setActivityPatterns={setActivityPatterns}
              setSpecialPatterns={setSpecialPatterns}
              setMergeRuleArray={setMergeRuleArray}
            />
          ) : (
            <TablesStep
              tables={tables}
              cfg={cfgWithTableDefaults}
              setTeachingLoadTable={setTeachingLoadTable}
              setTeachingLoadSource={setTeachingLoadSource}
              setPerformanceSummaryTable={setPerformanceSummaryTable}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function splitList(text) {
  return String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function EmptyState() {
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 14,
        padding: 22,
        color: "#6f83a8",
        fontWeight: 700,
      }}
    >
      Загрузите Excel для выбранного года.
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div style={{ padding: "8px 6px" }}>
      <div style={{ color: "#7c8aa5", fontSize: 12, fontWeight: 800 }}>
        {label}
      </div>
      <div style={{ color: "#17356f", fontWeight: 800, marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}

function StepButton({ step, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: active ? "1px solid rgba(49,95,203,0.24)" : "1px solid transparent",
        background: active ? "rgba(49,95,203,0.10)" : "transparent",
        borderRadius: 10,
        padding: "12px 10px",
        cursor: "pointer",
      }}
    >
      <div style={{ color: "#17356f", fontWeight: 800 }}>{step.title}</div>
      <div style={{ color: "#7c8aa5", fontSize: 12, fontWeight: 700, marginTop: 2 }}>
        {step.hint}
      </div>
    </button>
  );
}

function ColumnStep({ title, fields, cols, cfg, onChange, requiredKeys }) {
  return (
    <div>
      <StepTitle title={title} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {fields.map(([key, label]) => (
          <SelectRow
            key={key}
            label={label}
            value={cfg.columns[key]}
            cols={cols}
            required={requiredKeys.includes(key)}
            onChange={(v) => onChange(key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function RulesStep({
  cfg,
  setActivityPatterns,
  setSpecialPatterns,
  setMergeRuleArray,
}) {
  return (
    <div>
      <StepTitle title="Правила" />
      <div style={{ display: "grid", gap: 20 }}>
        <FieldGroup title="Типы занятий">
          <TextRow
            label="Лекции"
            value={cfg.activity_types.lecture.join(", ")}
            onChange={(v) => setActivityPatterns("lecture", v)}
          />
          <TextRow
            label="Лабораторные / практика"
            value={cfg.activity_types.lab_practice.join(", ")}
            onChange={(v) => setActivityPatterns("lab_practice", v)}
          />
        </FieldGroup>

        <FieldGroup title="Спецнагрузка">
          <TextRow
            label="Практика"
            value={cfg.special_workload_patterns.practika.join(", ")}
            onChange={(v) => setSpecialPatterns("practika", v)}
          />
          <TextRow
            label="ДП/МД"
            value={cfg.special_workload_patterns.diploma_supervision.join(", ")}
            onChange={(v) => setSpecialPatterns("diploma_supervision", v)}
          />
          <TextRow
            label="НИР"
            value={cfg.special_workload_patterns.research_work.join(", ")}
            onChange={(v) => setSpecialPatterns("research_work", v)}
          />
          <TextRow
            label="ДВР"
            value={cfg.special_workload_patterns.other_work.join(", ")}
            onChange={(v) => setSpecialPatterns("other_work", v)}
          />
        </FieldGroup>

        <FieldGroup title="Объединение">
          <TextRow
            label="Ключевые колонки"
            value={cfg.merge_rules.key_cols.join(", ")}
            onChange={(v) => setMergeRuleArray("key_cols", v)}
          />
        </FieldGroup>
      </div>
    </div>
  );
}

function TablesStep({
  tables,
  cfg,
  setTeachingLoadTable,
  setTeachingLoadSource,
  setPerformanceSummaryTable,
}) {
  return (
    <div>
      <StepTitle title="Привязка таблиц" />
      <div style={{ display: "grid", gap: 16 }}>
        <TeachingLoadBinding
          label="Штатка"
          tables={tables}
          binding={cfg.template_bindings.teaching_load.staff}
          onTableChange={(v) => setTeachingLoadTable("staff", v)}
          onSourceChange={(v) => setTeachingLoadSource("staff", v)}
        />
        <TeachingLoadBinding
          label="Почасовая"
          tables={tables}
          binding={cfg.template_bindings.teaching_load.hourly}
          onTableChange={(v) => setTeachingLoadTable("hourly", v)}
          onSourceChange={(v) => setTeachingLoadSource("hourly", v)}
        />
        <TeachingLoadBinding
          label="Сводная"
          tables={tables}
          binding={cfg.template_bindings.teaching_load.summary}
          onTableChange={(v) => setTeachingLoadTable("summary", v)}
          onSourceChange={(v) => setTeachingLoadSource("summary", v)}
        />
        <TableBinding
          label="Итоги выполнения ИП"
          tables={tables}
          binding={cfg.template_bindings.performance_summary}
          onTableChange={setPerformanceSummaryTable}
        />
      </div>
    </div>
  );
}

function StepTitle({ title }) {
  return (
    <div
      style={{
        color: "#17356f",
        fontSize: 28,
        fontWeight: 800,
        lineHeight: 1.1,
        marginBottom: 18,
      }}
    >
      {title}
    </div>
  );
}

function FieldGroup({ title, children }) {
  return (
    <section>
      <div style={{ color: "#17356f", fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
        {title}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function SelectRow({ label, value, cols, required, onChange }) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={{ color: "#334155", fontSize: 14, fontWeight: 800 }}>
        {label}
        {required ? <span style={{ color: "#b45309" }}> *</span> : null}
      </span>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        <option value="">—</option>
        {(cols || []).map((c) => (
          <option key={c.column_name} value={c.column_name}>
            {c.header_text}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextRow({ label, value, onChange }) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={{ color: "#334155", fontSize: 14, fontWeight: 800 }}>
        {label}
      </span>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={textInputStyle}
      />
    </label>
  );
}

function TeachingLoadBinding({
  label,
  tables,
  binding,
  onTableChange,
  onSourceChange,
}) {
  const source = binding?.source === "manual" ? "manual" : "excel";
  const value = binding?.raw_table_id || "";

  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={{ color: "#334155", fontSize: 14, fontWeight: 800 }}>
        {label}
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "170px minmax(0, 1fr)",
          gap: 10,
        }}
      >
        <select
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          style={selectStyle}
        >
          <option value="excel">Excel</option>
          <option value="manual">Вручную</option>
        </select>

        <select
          value={value}
          onChange={(e) => onTableChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">Выберите таблицу</option>
          {(tables || []).map((t) => (
            <option key={t.id} value={t.id}>
              {tableOptionLabel(t)}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function TableBinding({ label, tables, binding, onTableChange }) {
  const value = binding?.raw_table_id || "";

  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={{ color: "#334155", fontSize: 14, fontWeight: 800 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onTableChange(e.target.value)}
        style={selectStyle}
      >
        <option value="">Выберите таблицу</option>
        {(tables || []).map((t) => (
          <option key={t.id} value={t.id}>
            {tableOptionLabel(t)}
          </option>
        ))}
      </select>
    </label>
  );
}

function tableOptionLabel(table) {
  const index = Number(table?.table_index ?? 0) + 1;
  const title = String(table?.section_title || "").trim();
  return title ? `Таблица ${index} - ${title}` : `Таблица ${index}`;
}

function badgeStyle(color, background) {
  return {
    color,
    background,
    border: `1px solid ${color}22`,
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 13,
    fontWeight: 800,
  };
}
