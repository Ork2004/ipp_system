import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

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
    } catch {
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
      if (!id) {
        setTables([]);
        return;
      }

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
        Настройка
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
              alignItems: "center",
            }}
          >
            <input
              className="input"
              style={{
                width: 220,
                height: 48,
                borderRadius: 14,
                border: "1px solid #d9e3f5",
                background: "#f8fbff",
                boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
              }}
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="2025-2026"
            />

            <div
              className="small"
              style={{
                color: status ? "#315fcb" : "#7c8aa5",
                fontWeight: 500,
                minHeight: 20,
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
          <SectionCard
            title="Маппинг колонок"
            subtitle="Выбери нужные колонки из Excel шаблона"
          >
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
            </div>
          </SectionCard>

          <SectionCard
            title="Типы занятий"
            subtitle="Ключевые слова для определения категорий"
          >
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

          <SectionCard
            title="Правила объединения"
            subtitle="Настройка ключевых полей для merge логики"
          >
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              <TextRow
                label="Key cols"
                value={cfg.merge_rules.key_cols.join(", ")}
                onChange={(v) => setMergeRuleArray("key_cols", v)}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Привязка таблиц"
            subtitle="Какие таблицы из raw template использовать в генерации"
          >
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              <TeachingLoadBinding
                label="Штатка"
                tables={tables}
                value={cfg.template_bindings.teaching_load.staff.raw_table_id}
                onChange={(v) => setTeachingLoadTable("staff", v)}
              />

              <TeachingLoadBinding
                label="Почасовая"
                tables={tables}
                value={cfg.template_bindings.teaching_load.hourly.raw_table_id}
                onChange={(v) => setTeachingLoadTable("hourly", v)}
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
            marginBottom: 8,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>

        <div
          style={{
            color: "#7c8aa5",
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
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
          outline: "none",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
        }}
      />
    </div>
  );
}

function TeachingLoadBinding({ label, tables, value, onChange }) {
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
          outline: "none",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
        }}
      >
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