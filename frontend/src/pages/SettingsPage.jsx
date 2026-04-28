import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const yearFieldStyle = {
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
  caretColor: "#17356f",
};

const topLabelStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#5f7195",
  marginBottom: 8,
};

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
      teaching_load: {
        ...base.template_bindings.teaching_load,
        ...(baseConfig?.template_bindings?.teaching_load || {}),
        ...(loaded.template_bindings?.teaching_load || {}),
        summary: mergedSummaryBinding,
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
      setStatus("Сохранение...");
      await api.post("/settings/save", {
        department_id: departmentId,
        academic_year: academicYear,
        config: cfg,
      });
      setStatus("Сохранено");
    } catch {
      setStatus("Ошибка сохранения");
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
    const arr = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setCfg((prev) => ({
      ...prev,
      activity_types: {
        ...prev.activity_types,
        [typeKey]: arr,
      },
    }));
  }

  function setSpecialPatterns(bucketKey, text) {
    const arr = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setCfg((prev) => ({
      ...prev,
      special_workload_patterns: {
        ...prev.special_workload_patterns,
        [bucketKey]: arr,
      },
    }));
  }

  function setMergeRuleArray(key, text) {
    const arr = text
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
        Настройки
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
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={topLabelStyle}>Учебный год</div>
              <input
                className="input"
                style={yearFieldStyle}
                value={academicYear}
                onChange={(e) => handleYearChange(e.target.value)}
                placeholder="2025-2026"
              />
            </div>

            <div
              className="small"
              style={{
                color: status ? "#315fcb" : "#7c8aa5",
                fontWeight: 600,
                minHeight: 20,
                paddingBottom: 10,
              }}
            >
              {status}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "#f7faff",
                border: "1px solid #dfe8f7",
                color: "#5f7195",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Кафедра ID: {departmentId || "—"}
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "#f7faff",
                border: "1px solid #dfe8f7",
                color: "#5f7195",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Excel шаблон: {excelTemplateId || "—"}
            </div>

            <button
              className="btn btn-primary"
              onClick={saveSettings}
              style={{
                minWidth: 150,
                height: 46,
                borderRadius: 14,
                fontWeight: 700,
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
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: 20,
          }}
        >
          <SectionCard title="Маппинг колонок">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              <SelectRow
                label="ФИО"
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
                label="ОП"
                value={cfg.columns.op_col}
                cols={cols}
                onChange={(v) => setCol("op_col", v)}
              />

              <SelectRow
                label="Курс"
                value={cfg.columns.course_col}
                cols={cols}
                onChange={(v) => setCol("course_col", v)}
              />

              <SelectRow
                label="Акад. период"
                value={cfg.columns.academic_period_col}
                cols={cols}
                onChange={(v) => setCol("academic_period_col", v)}
              />

              <SelectRow
                label="Кредиты"
                value={cfg.columns.credits_col}
                cols={cols}
                onChange={(v) => setCol("credits_col", v)}
              />

              <SelectRow
                label="Контингент"
                value={cfg.columns.student_count_col}
                cols={cols}
                onChange={(v) => setCol("student_count_col", v)}
              />

              <SelectRow
                label="Форма оплаты"
                value={cfg.columns.payment_form_col}
                cols={cols}
                onChange={(v) => setCol("payment_form_col", v)}
              />

              <SelectRow
                label="Норматив"
                value={cfg.columns.normative_col}
                cols={cols}
                onChange={(v) => setCol("normative_col", v)}
              />

              <SelectRow
                label="Лекции (часы)"
                value={cfg.columns.lecture_hours_col}
                cols={cols}
                onChange={(v) => setCol("lecture_hours_col", v)}
              />

              <SelectRow
                label="Практ./семин. (часы)"
                value={cfg.columns.practice_hours_col}
                cols={cols}
                onChange={(v) => setCol("practice_hours_col", v)}
              />

              <SelectRow
                label="Лабораторные (часы)"
                value={cfg.columns.lab_hours_col}
                cols={cols}
                onChange={(v) => setCol("lab_hours_col", v)}
              />

              <SelectRow
                label="СРСП (часы)"
                value={cfg.columns.srsp_hours_col}
                cols={cols}
                onChange={(v) => setCol("srsp_hours_col", v)}
              />

              <SelectRow
                label="РК 1,2"
                value={cfg.columns.rk_hours_col}
                cols={cols}
                onChange={(v) => setCol("rk_hours_col", v)}
              />

              <SelectRow
                label="Экзамен"
                value={cfg.columns.exam_hours_col}
                cols={cols}
                onChange={(v) => setCol("exam_hours_col", v)}
              />

              <SelectRow
                label="Практика"
                value={cfg.columns.practice_load_col}
                cols={cols}
                onChange={(v) => setCol("practice_load_col", v)}
              />

              <SelectRow
                label="Рук-во ДП/МД"
                value={cfg.columns.diploma_load_col}
                cols={cols}
                onChange={(v) => setCol("diploma_load_col", v)}
              />

              <SelectRow
                label="НИРМ/НИРД"
                value={cfg.columns.research_load_col}
                cols={cols}
                onChange={(v) => setCol("research_load_col", v)}
              />

              <SelectRow
                label="ДВР"
                value={cfg.columns.other_load_col}
                cols={cols}
                onChange={(v) => setCol("other_load_col", v)}
              />

              <SelectRow
                label="Итого"
                value={cfg.columns.total_col}
                cols={cols}
                onChange={(v) => setCol("total_col", v)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Типы занятий">
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
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
            </div>
          </SectionCard>

          <SectionCard title="Спецнагрузка">
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              <TextRow
                label="Практика"
                value={cfg.special_workload_patterns.practika.join(", ")}
                onChange={(v) => setSpecialPatterns("practika", v)}
              />

              <TextRow
                label="Рук-во ДП/МД"
                value={cfg.special_workload_patterns.diploma_supervision.join(
                  ", "
                )}
                onChange={(v) =>
                  setSpecialPatterns("diploma_supervision", v)
                }
              />

              <TextRow
                label="НИРМ/НИРД"
                value={cfg.special_workload_patterns.research_work.join(", ")}
                onChange={(v) => setSpecialPatterns("research_work", v)}
              />

              <TextRow
                label="ДВР"
                value={cfg.special_workload_patterns.other_work.join(", ")}
                onChange={(v) => setSpecialPatterns("other_work", v)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Правила объединения">
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              <TextRow
                label="Ключевые колонки"
                value={cfg.merge_rules.key_cols.join(", ")}
                onChange={(v) => setMergeRuleArray("key_cols", v)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Привязка таблиц">
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
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
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section
      style={{
        borderRadius: 24,
        border: "1px solid #e4ebf7",
        background: "#ffffff",
        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.04)",
        padding: 22,
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: "#17356f",
            lineHeight: 1.1,
            marginBottom: subtitle ? 8 : 0,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>

        {subtitle ? (
          <div
            style={{
              color: "#7c8aa5",
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function SelectRow({ label, value, cols, onChange }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#334155",
        }}
      >
        {label}
      </label>

      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: 52,
          borderRadius: 14,
          border: "1px solid #d9e3f5",
          background: "#f8fbff",
          padding: "0 14px",
          fontSize: 15,
          color: "#1f2f4d",
          WebkitTextFillColor: "#1f2f4d",
          caretColor: "#1f2f4d",
          outline: "none",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
        }}
      >
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
    <div style={{ display: "grid", gap: 8 }}>
      <label
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#334155",
        }}
      >
        {label}
      </label>

      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: 52,
          borderRadius: 14,
          border: "1px solid #d9e3f5",
          background: "#f8fbff",
          padding: "0 14px",
          fontSize: 15,
          color: "#1f2f4d",
          WebkitTextFillColor: "#1f2f4d",
          caretColor: "#1f2f4d",
          outline: "none",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
        }}
      />
    </div>
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
    <div style={{ display: "grid", gap: 8 }}>
      <label
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#334155",
        }}
      >
        {label}
      </label>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "180px minmax(0, 1fr)",
        }}
      >
        <select
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            border: "1px solid #d9e3f5",
            background: "#f8fbff",
            padding: "0 14px",
            fontSize: 15,
            color: "#1f2f4d",
            WebkitTextFillColor: "#1f2f4d",
            caretColor: "#1f2f4d",
            outline: "none",
            boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
          }}
        >
          <option value="excel">Excel</option>
          <option value="manual">Вручную</option>
        </select>

        <select
          value={value}
          onChange={(e) => onTableChange(e.target.value)}
          style={{
            width: "100%",
            height: 52,
            borderRadius: 14,
            border: "1px solid #d9e3f5",
            background: "#f8fbff",
            padding: "0 14px",
            fontSize: 15,
            color: "#1f2f4d",
            WebkitTextFillColor: "#1f2f4d",
            caretColor: "#1f2f4d",
            outline: "none",
            boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
          }}
        >
          <option value="">Выберите таблицу</option>
          {(tables || []).map((t) => (
            <option key={t.id} value={t.id}>
              Таблица {t.table_index + 1}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
