import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

function copyToClipboard(text) {
  navigator.clipboard.writeText(text || "");
}

export default function SettingsPage() {
  const navigate = useNavigate();

  const [departmentId, setDepartmentId] = useState(
    Number(localStorage.getItem("department_id") || 0)
  );
  const [excelTemplates, setExcelTemplates] = useState([]);
  const [academicYear, setAcademicYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );
  const [excelTemplateId, setExcelTemplateId] = useState("");

  const [cols, setCols] = useState([]);
  const [settingsStatus, setSettingsStatus] = useState("");

  const [advancedOpen, setAdvancedOpen] = useState(false);

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
  });

  const [phData, setPhData] = useState({ stable: [], dynamic: [] });
  const [phStatus, setPhStatus] = useState("");

  const [blocksData, setBlocksData] = useState({
    blocks: [],
    semester_map: {},
  });
  const [blocksStatus, setBlocksStatus] = useState("");

  const years = useMemo(() => {
    const set = new Set(
      (excelTemplates || []).map((t) => t.academic_year).filter(Boolean)
    );
    set.add(academicYear);
    return Array.from(set).sort().reverse();
  }, [excelTemplates, academicYear]);

  const excelForYear = useMemo(() => {
    return (
      (excelTemplates || []).find(
        (t) => String(t.academic_year) === String(academicYear)
      ) || null
    );
  }, [excelTemplates, academicYear]);

  const colOptions = useMemo(
    () => (cols || []).map((c) => c.column_name),
    [cols]
  );

  function setCol(key, value) {
    setCfg((prev) => ({
      ...prev,
      columns: { ...prev.columns, [key]: value },
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
      merge_rules: { ...(prev.merge_rules || {}), [key]: value },
    }));
  }

  function setMergeRuleArray(key, arr) {
    setCfg((prev) => ({
      ...prev,
      merge_rules: { ...(prev.merge_rules || {}), [key]: arr },
    }));
  }

  function setSumColsByType(typeKey, arr) {
    setCfg((prev) => ({
      ...prev,
      merge_rules: {
        ...(prev.merge_rules || {}),
        sum_cols_by_type: {
          ...((prev.merge_rules || {}).sum_cols_by_type || {}),
          [typeKey]: arr,
        },
      },
    }));
  }

  async function loadExcelTemplates(depId = departmentId) {
    if (!depId) {
      setSettingsStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    try {
      const res = await api.get("/excel/templates", {
        params: { department_id: depId },
      });
      setExcelTemplates(res.data || []);
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка загрузки Excel");
    }
  }

  async function loadColumns(exId) {
    if (!exId) return;
    try {
      const res = await api.get(`/excel/${exId}/columns`);
      setCols(res.data || []);
    } catch (e) {
      console.error(e);
      setSettingsStatus("Ошибка загрузки колонок");
    }
  }

  async function loadCurrentSettingsByYear(depId, year) {
    if (!depId || !year) return;
    try {
      const res = await api.get("/settings/current", {
        params: { department_id: depId, academic_year: year },
      });

      if (res.data?.exists) {
        const loaded = res.data.config || {};
        const c = loaded.columns || {};
        const at = loaded.activity_types || {};
        const mr = loaded.merge_rules || {};
        const sct = mr.sum_cols_by_type || {};

        setCfg({
          columns: {
            teacher_col: c.teacher_col || "",
            staff_hours_col: c.staff_hours_col || "",
            hourly_hours_col: c.hourly_hours_col || "",

            discipline_col: c.discipline_col || "",
            activity_type_col: c.activity_type_col || "",
            group_col: c.group_col || "",
            op_col: c.op_col || "",
          },
          activity_types: {
            lecture: Array.isArray(at.lecture)
              ? at.lecture
              : ["лек", "лк", "lecture"],
            lab_practice: Array.isArray(at.lab_practice)
              ? at.lab_practice
              : ["лаб", "пра", "lab", "pract"],
          },
          merge_rules: {
            key_cols: Array.isArray(mr.key_cols)
              ? mr.key_cols
              : ["distsiplina", "op"],
            group_join: mr.group_join || ", ",
            group_priority_type: mr.group_priority_type || "lecture",
            sum_cols_by_type: {
              lecture: Array.isArray(sct.lecture)
                ? sct.lecture
                : ["l", "srsp", "ekzameny"],
              lab_practice: Array.isArray(sct.lab_practice)
                ? sct.lab_practice
                : ["spz", "lz", "rk_1_2"],
            },
          },
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadPlaceholders(exId) {
    if (!exId) {
      setPhStatus("Нет Excel для этого года");
      return;
    }
    try {
      const res = await api.get("/placeholders", {
        params: { excel_template_id: exId },
      });
      setPhData(res.data || { stable: [], dynamic: [] });
      setPhStatus("");
    } catch (e) {
      console.error(e);
      setPhStatus("Ошибка загрузки плейсхолдеров");
    }
  }

  async function loadBlocks(exId) {
    if (!exId) {
      setBlocksStatus("Нет Excel для этого года");
      return;
    }
    try {
      const res = await api.get("/blocks/available", {
        params: { excel_template_id: exId },
      });
      setBlocksData(res.data || { blocks: [], semester_map: {} });
      setBlocksStatus("");
    } catch (e) {
      console.error(e);
      setBlocksStatus(e?.response?.data?.detail || "Ошибка загрузки blocks");
    }
  }

  async function saveSettings() {
    if (!departmentId)
      return setSettingsStatus("Нет department_id. Выйди и зайди заново.");
    if (!academicYear) return setSettingsStatus("Укажи год");
    if (!excelTemplateId)
      return setSettingsStatus("Нет Excel для этого года");

    const c = cfg.columns || {};
    if (!c.teacher_col || !c.staff_hours_col)
      return setSettingsStatus(
        "Обязательные: ФИО преподавателя и Штатные часы"
      );
    if (!c.discipline_col || !c.activity_type_col || !c.group_col) {
      return setSettingsStatus(
        "Обязательные: Дисциплина, Вид занятий, Группа"
      );
    }

    const mr = cfg.merge_rules || {};
    const sct = mr.sum_cols_by_type || {};
    if (!Array.isArray(mr.key_cols) || !mr.key_cols.length) {
      return setSettingsStatus(
        "Расширенные: не задано “по каким колонкам объединять дисциплину”"
      );
    }

    const lectureArr = Array.isArray(sct.lecture) ? sct.lecture : [];
    const labArr = Array.isArray(sct.lab_practice) ? sct.lab_practice : [];
    if (!lectureArr.length && !labArr.length) {
      return setSettingsStatus("Расширенные: выбери колонки для суммирования");
    }

    try {
      setSettingsStatus("Сохранение...");
      await api.post("/settings/save", {
        department_id: Number(departmentId),
        academic_year: academicYear,
        config: cfg,
      });
      setSettingsStatus("Сохранено ✅");
      await loadBlocks(excelTemplateId);
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка сохранения");
    }
  }

  const grouped = useMemo(() => {
    const stableTeacher = (phData.stable || []).filter(
      (i) => i.category === "teacher"
    );
    const dynamicRow = phData.dynamic || [];
    return { stableTeacher, dynamicRow };
  }, [phData]);

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);

    const refreshAll = async () => {
      const d = Number(localStorage.getItem("department_id") || 0);
      if (!d) return;
      await loadExcelTemplates(d);
    };

    refreshAll();

    window.addEventListener("focus", refreshAll);
    const onVis = () =>
      document.visibilityState === "visible" && refreshAll();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", refreshAll);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ex = excelForYear;
    const id = ex ? String(ex.id) : "";
    setExcelTemplateId(id);

    if (ex) {
      (async () => {
        setSettingsStatus("");
        await loadColumns(id);
        await loadPlaceholders(id);
        await loadBlocks(id);
        await loadCurrentSettingsByYear(departmentId, academicYear);
      })();
    } else {
      setCols([]);
      setPhData({ stable: [], dynamic: [] });
      setBlocksData({ blocks: [], semester_map: {} });
      setSettingsStatus("Нет Excel для этого года");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYear, excelTemplates]);

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
        Настройка генерации
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
            marginBottom: 12,
          }}
        >
          <select
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
            onChange={(e) => {
              const y = e.target.value;
              setAcademicYear(y);
              localStorage.setItem("academic_year", y);
            }}
          >
            {years.length ? null : <option value={academicYear}>{academicYear}</option>}
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <div
            className="small"
            style={{
              color: settingsStatus ? "#315fcb" : "#7c8aa5",
              fontWeight: 500,
            }}
          >
            {settingsStatus}
          </div>
        </div>

        <div className="hr" style={{ opacity: 0.7 }} />

        <div
          className="section-title"
          style={{
            marginTop: 14,
            marginBottom: 12,
            fontSize: 28,
            fontWeight: 800,
            color: "#17356f",
            letterSpacing: "-0.02em",
          }}
        >
          Маппинг колонок
        </div>

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

        <div className="hr" style={{ opacity: 0.7 }} />

        <div
          className="section-title"
          style={{
            marginTop: 14,
            marginBottom: 12,
            fontSize: 28,
            fontWeight: 800,
            color: "#17356f",
            letterSpacing: "-0.02em",
          }}
        >
          Названия видов занятий
        </div>

        <TextRow
          label="Лекции"
          value={(cfg.activity_types?.lecture || []).join(", ")}
          onChange={(v) => setActivityPatterns("lecture", v)}
          placeholder="лек, лк, lecture"
        />
        <TextRow
          label="Лаб/практики"
          value={(cfg.activity_types?.lab_practice || []).join(", ")}
          onChange={(v) => setActivityPatterns("lab_practice", v)}
          placeholder="лаб, пра, lab, pract"
        />

        <div className="hr" style={{ marginTop: 18, opacity: 0.7 }} />

        <div style={{ marginTop: 6 }}>
          <button
            className="btn btn-outline"
            onClick={() => setAdvancedOpen((v) => !v)}
            type="button"
            style={{
              borderRadius: 12,
              height: 44,
              fontWeight: 700,
              border: "1px solid #d6e2fb",
              background: "#fff",
            }}
          >
            {advancedOpen
              ? "Скрыть расширенные настройки"
              : "Расширенные настройки"}
          </button>

          {advancedOpen ? (
            <div style={{ marginTop: 14 }}>
              <CheckboxMultiSelect
                label="По каким колонкам объединять дисциплину"
                options={colOptions}
                value={cfg.merge_rules?.key_cols || []}
                onChange={(arr) => setMergeRuleArray("key_cols", arr)}
              />

              <div
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 260,
                    fontWeight: 700,
                    color: "#1e3a8a",
                  }}
                >
                  Откуда брать список групп
                </div>
                <select
                  className="input"
                  style={{
                    width: 260,
                    height: 48,
                    borderRadius: 14,
                    border: "1px solid #d9e3f5",
                    background: "#f8fbff",
                  }}
                  value={cfg.merge_rules?.group_priority_type || "lecture"}
                  onChange={(e) =>
                    setMergeRule("group_priority_type", e.target.value)
                  }
                >
                  <option value="lecture">Лекции</option>
                  <option value="lab_practice">Лаб/практики</option>
                </select>
              </div>

              <CheckboxMultiSelect
                label="Какие колонки суммировать из лекций"
                options={colOptions}
                value={cfg.merge_rules?.sum_cols_by_type?.lecture || []}
                onChange={(arr) => setSumColsByType("lecture", arr)}
              />

              <CheckboxMultiSelect
                label="Какие колонки суммировать из лаб/практик"
                options={colOptions}
                value={cfg.merge_rules?.sum_cols_by_type?.lab_practice || []}
                onChange={(arr) => setSumColsByType("lab_practice", arr)}
              />
            </div>
          ) : null}

          <div className="actions-row" style={{ marginTop: 14 }}>
            <button
              className="btn btn-primary"
              onClick={saveSettings}
              disabled={!excelTemplateId}
              style={{
                minWidth: 180,
                height: 48,
                borderRadius: 14,
                fontWeight: 800,
                letterSpacing: "0.02em",
                boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
              }}
            >
              СОХРАНИТЬ
            </button>
          </div>
        </div>

        <div className="hr" style={{ marginTop: 18, opacity: 0.7 }} />

        <div
          className="section-title"
          style={{
            marginTop: 14,
            marginBottom: 12,
            fontSize: 28,
            fontWeight: 800,
            color: "#17356f",
            letterSpacing: "-0.02em",
          }}
        >
          Плейсхолдеры и blocks
        </div>

        <div
          className="small"
          style={{
            marginBottom: 10,
            color: "#7c8aa5",
          }}
        >
          {phStatus || blocksStatus}
        </div>

        <Section
          title="teacher.*"
          items={grouped.stableTeacher}
          copyField="example"
        />
        <Section title="row.*" items={grouped.dynamicRow} copyField="example" />
        <BlocksSection title="blocks.*" blocks={blocksData.blocks || []} />

        <div className="actions-row" style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/docx-upload")}
            style={{
              minWidth: 150,
              height: 46,
              borderRadius: 14,
              fontWeight: 800,
              boxShadow: "0 12px 24px rgba(58,110,255,0.18)",
            }}
          >
            ДАЛЕЕ
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectRow({ label, value, cols, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          width: 260,
          fontWeight: 700,
          color: "#1e3a8a",
        }}
      >
        {label}
      </div>

      <select
        className="input"
        style={{
          width: 680,
          height: 48,
          borderRadius: 14,
          border: "1px solid #d9e3f5",
          background: "#f8fbff",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
        }}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {cols.map((c) => (
          <option key={c.column_name} value={c.column_name}>
            {c.header_text}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextRow({ label, value, onChange, placeholder }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          width: 260,
          fontWeight: 700,
          color: "#1e3a8a",
        }}
      >
        {label}
      </div>

      <input
        className="input"
        style={{
          width: 680,
          height: 48,
          borderRadius: 14,
          border: "1px solid #d9e3f5",
          background: "#f8fbff",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
        }}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function CheckboxMultiSelect({ label, options, value, onChange }) {
  const set = useMemo(() => new Set(value || []), [value]);

  function toggle(opt) {
    const next = new Set(set);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(Array.from(next));
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontWeight: 700,
          marginBottom: 8,
          color: "#1e3a8a",
        }}
      >
        {label}
      </div>

      <div
        className="card"
        style={{
          borderRadius: 16,
          padding: 12,
          border: "1px solid rgba(15,23,42,.08)",
          maxHeight: 220,
          overflow: "auto",
          background: "#fbfdff",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.02)",
        }}
      >
        {!options.length ? (
          <div className="small" style={{ color: "#7c8aa5" }}>
            Нет колонок
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            {options.map((opt) => (
              <label
                key={opt}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,.08)",
                  background: set.has(opt)
                    ? "rgba(47,107,255,.08)"
                    : "white",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={set.has(opt)}
                  onChange={() => toggle(opt)}
                  style={{ transform: "scale(1.05)" }}
                />
                <span
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 13,
                    color: "#1f2f4d",
                  }}
                >
                  {opt}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, items, copyField }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div
        className="section-title"
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "#17356f",
          marginBottom: 10,
        }}
      >
        {title}
      </div>

      <div
        className="table-wrap"
        style={{
          overflowX: "auto",
          borderRadius: 20,
          border: "1px solid #e4ebf7",
          background: "#fff",
        }}
      >
        <table
          className="table"
          style={{
            marginTop: 0,
            minWidth: 900,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  background: "#f7faff",
                  color: "#5f7195",
                  fontWeight: 800,
                  fontSize: 14,
                  padding: "18px 16px",
                }}
              >
                Placeholder
              </th>
              <th
                style={{
                  background: "#f7faff",
                  color: "#5f7195",
                  fontWeight: 800,
                  fontSize: 14,
                  padding: "18px 16px",
                }}
              >
                Описание
              </th>
              <th
                style={{
                  background: "#f7faff",
                  color: "#5f7195",
                  fontWeight: 800,
                  fontSize: 14,
                  padding: "18px 16px",
                }}
              >
                Пример
              </th>
              <th
                style={{
                  width: 120,
                  background: "#f7faff",
                  color: "#5f7195",
                  fontWeight: 800,
                  fontSize: 14,
                  padding: "18px 16px",
                }}
              >
                Copy
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan="4"
                  style={{
                    textAlign: "center",
                    padding: "28px 16px",
                    color: "#7c8aa5",
                    fontWeight: 500,
                  }}
                >
                  Нет данных
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.placeholder_name}>
                  <td
                    style={{
                      fontWeight: 800,
                      color: "#17356f",
                      padding: "18px 16px",
                    }}
                  >
                    {p.placeholder_name}
                  </td>
                  <td style={{ padding: "18px 16px", color: "#1f2f4d" }}>
                    {p.description || ""}
                  </td>
                  <td
                    style={{
                      padding: "18px 16px",
                      color: "#556987",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    {p[copyField] || ""}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => copyToClipboard(p[copyField] || "")}
                      style={{
                        borderRadius: 12,
                        height: 40,
                        minWidth: 90,
                        fontWeight: 700,
                      }}
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlocksSection({ title, blocks }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div
        className="section-title"
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "#17356f",
          marginBottom: 10,
        }}
      >
        {title}
      </div>

      <div
        className="table-wrap"
        style={{
          overflowX: "auto",
          borderRadius: 20,
          border: "1px solid #e4ebf7",
          background: "#fff",
        }}
      >
        <table
          className="table"
          style={{
            marginTop: 0,
            minWidth: 980,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  background: "#f7faff",
                  color: "#5f7195",
                  fontWeight: 800,
                  fontSize: 14,
                  padding: "18px 16px",
                }}
              >
                Block
              </th>
              <th
                style={{
                  background: "#f7faff",
                  color: "#5f7195",
                  fontWeight: 800,
                  fontSize: 14,
                  padding: "18px 16px",
                }}
              >
                Описание
              </th>
              <th
                style={{
                  background: "#f7faff",
                  color: "#5f7195",
                  fontWeight: 800,
                  fontSize: 14,
                  padding: "18px 16px",
                }}
              >
                Snippet
              </th>
              <th
                style={{
                  width: 120,
                  background: "#f7faff",
                  color: "#5f7195",
                  fontWeight: 800,
                  fontSize: 14,
                  padding: "18px 16px",
                }}
              >
                Copy
              </th>
            </tr>
          </thead>
          <tbody>
            {!blocks.length ? (
              <tr>
                <td
                  colSpan="4"
                  style={{
                    textAlign: "center",
                    padding: "28px 16px",
                    color: "#7c8aa5",
                    fontWeight: 500,
                  }}
                >
                  Нет blocks
                </td>
              </tr>
            ) : (
              blocks.map((b) => (
                <tr key={b.key}>
                  <td
                    style={{
                      fontWeight: 800,
                      color: "#17356f",
                      padding: "18px 16px",
                    }}
                  >
                    {b.key}
                  </td>
                  <td style={{ padding: "18px 16px", color: "#1f2f4d" }}>
                    {b.title || ""}
                  </td>
                  <td
                    style={{
                      padding: "18px 16px",
                      color: "#556987",
                      whiteSpace: "pre-wrap",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    {b.snippet || ""}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => copyToClipboard(b.snippet || "")}
                      style={{
                        borderRadius: 12,
                        height: 40,
                        minWidth: 90,
                        fontWeight: 700,
                      }}
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}