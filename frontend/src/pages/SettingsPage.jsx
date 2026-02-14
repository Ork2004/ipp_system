import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

function copyToClipboard(text) {
  navigator.clipboard.writeText(text || "");
}

export default function SettingsPage() {
  const navigate = useNavigate();

  const [departmentId, setDepartmentId] = useState(Number(localStorage.getItem("department_id") || 0));

  const [excelTemplates, setExcelTemplates] = useState([]);
  const [docxTemplates, setDocxTemplates] = useState([]);

  const [academicYear, setAcademicYear] = useState(localStorage.getItem("academic_year") || "2025-2026");

  const [excelTemplateId, setExcelTemplateId] = useState(localStorage.getItem("excel_template_id") || "");
  const [docxTemplateId, setDocxTemplateId] = useState(localStorage.getItem("docx_template_id") || "");

  const [cols, setCols] = useState([]);
  const [settingsStatus, setSettingsStatus] = useState("");

  const [cfg, setCfg] = useState({
    columns: {
      teacher_col: "",
      staff_hours_col: "",
      hourly_hours_col: "",
    },
  });

  const [phData, setPhData] = useState({ stable: [], dynamic: [] });
  const [phStatus, setPhStatus] = useState("");

  const [blocksData, setBlocksData] = useState({ blocks: [], semester_map: {} });
  const [blocksStatus, setBlocksStatus] = useState("");

  const years = useMemo(() => {
    const set = new Set((excelTemplates || []).map((t) => t.academic_year).filter(Boolean));
    set.add(academicYear);
    return Array.from(set).sort().reverse();
  }, [excelTemplates, academicYear]);

  const excelForYear = useMemo(() => {
    if (!academicYear) return excelTemplates;
    return (excelTemplates || []).filter((t) => t.academic_year === academicYear);
  }, [excelTemplates, academicYear]);

  function persistExcelId(v) {
    setExcelTemplateId(v);
    if (v) localStorage.setItem("excel_template_id", v);
    else localStorage.removeItem("excel_template_id");
  }

  function persistDocxId(v) {
    setDocxTemplateId(v);
    if (v) localStorage.setItem("docx_template_id", v);
    else localStorage.removeItem("docx_template_id");
  }

  function setOne(key, value) {
    setCfg((prev) => ({ ...prev, columns: { ...prev.columns, [key]: value } }));
  }

  async function loadExcelTemplates(depId = departmentId) {
    if (!depId) {
      setSettingsStatus("Нет department_id. Выйди и зайди заново.");
      return;
    }
    try {
      const res = await api.get("/excel/templates", { params: { department_id: depId } });
      setExcelTemplates(res.data || []);
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка загрузки Excel");
    }
  }

  async function loadDocxTemplates(depId = departmentId) {
    if (!depId) return;
    try {
      const res = await api.get("/docx/templates", { params: { department_id: depId } });
      setDocxTemplates(res.data || []);
    } catch (e) {
      console.error(e);
      setSettingsStatus(e?.response?.data?.detail || "Ошибка загрузки DOCX");
    }
  }

  async function loadColumns(targetExcelId) {
    const id = targetExcelId || excelTemplateId;
    if (!id) {
      setSettingsStatus("Выбери Excel");
      return;
    }
    try {
      const res = await api.get(`/excel/${id}/columns`);
      setCols(res.data || []);
    } catch (e) {
      console.error(e);
      setSettingsStatus("Ошибка загрузки колонок");
    }
  }

  async function loadCurrentSettings(targetExcelId, targetDocxId) {
    const ex = targetExcelId || excelTemplateId;
    const dx = targetDocxId || docxTemplateId;
    if (!ex || !dx) return;

    try {
      const res = await api.get("/settings/current", {
        params: { excel_template_id: ex, docx_template_id: dx },
      });

      if (res.data?.exists) {
        const loaded = res.data.config || {};
        const c = loaded.columns || {};
        setCfg({
          ...loaded,
          columns: {
            teacher_col: c.teacher_col || "",
            staff_hours_col: c.staff_hours_col || "",
            hourly_hours_col: c.hourly_hours_col || "",
          },
        });
      } else {
        setCfg((prev) => ({
          ...prev,
          columns: {
            teacher_col: prev.columns.teacher_col || "",
            staff_hours_col: prev.columns.staff_hours_col || "",
            hourly_hours_col: prev.columns.hourly_hours_col || "",
          },
        }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadPlaceholders(targetExcelId) {
    const ex = targetExcelId || excelTemplateId;
    if (!ex) {
      setPhStatus("Выбери Excel");
      return;
    }
    try {
      const res = await api.get("/placeholders", { params: { excel_template_id: ex } });
      setPhData(res.data || { stable: [], dynamic: [] });
      setPhStatus("");
    } catch (e) {
      console.error(e);
      setPhStatus("Ошибка загрузки плейсхолдеров");
    }
  }

  async function loadBlocks(targetExcelId) {
    const ex = targetExcelId || excelTemplateId;
    if (!ex) {
      setBlocksStatus("Выбери Excel");
      return;
    }
    try {
      const res = await api.get("/blocks/available", { params: { excel_template_id: ex } });
      setBlocksData(res.data || { blocks: [], semester_map: {} });
      setBlocksStatus("");
    } catch (e) {
      console.error(e);
      setBlocksStatus(e?.response?.data?.detail || "Ошибка загрузки blocks");
    }
  }

  async function saveSettings() {
    if (!excelTemplateId || !docxTemplateId) {
      setSettingsStatus("Выбери Excel и DOCX");
      return;
    }

    const c = cfg.columns || {};
    if (!c.teacher_col || !c.staff_hours_col) {
      setSettingsStatus("Обязательные: teacher_col и staff_hours_col");
      return;
    }

    try {
      setSettingsStatus("Сохранение...");
      await api.post("/settings/save", {
        excel_template_id: Number(excelTemplateId),
        docx_template_id: Number(docxTemplateId),
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
    const stableTeacher = (phData.stable || []).filter((i) => i.category === "teacher");
    const dynamicRow = phData.dynamic || [];
    return { stableTeacher, dynamicRow };
  }, [phData]);

  useEffect(() => {
    const dep = Number(localStorage.getItem("department_id") || 0);
    setDepartmentId(dep);

    const refreshAll = async () => {
      const d = Number(localStorage.getItem("department_id") || 0);
      if (!d) return;
      await Promise.all([loadExcelTemplates(d), loadDocxTemplates(d)]);
    };

    refreshAll();

    const onFocus = () => refreshAll();
    window.addEventListener("focus", onFocus);

    const onVis = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!excelTemplates.length) return;
    const list = excelForYear;
    if (!list.length) return;

    const exists = list.some((t) => String(t.id) === String(excelTemplateId));
    if (!exists) {
      const first = list[0];
      const firstId = String(first.id);
      persistExcelId(firstId);

      const y = first.academic_year || academicYear;
      localStorage.setItem("academic_year", y);
      setAcademicYear(y);
    }
  }, [excelTemplates, academicYear]);

  useEffect(() => {
    if (!excelTemplateId) return;

    (async () => {
      setSettingsStatus("");
      await loadColumns(excelTemplateId);
      await loadPlaceholders(excelTemplateId);
      await loadBlocks(excelTemplateId);
      await loadCurrentSettings(excelTemplateId, docxTemplateId);
    })();
  }, [excelTemplateId]);

  useEffect(() => {
    if (!excelTemplateId || !docxTemplateId) return;
    loadCurrentSettings(excelTemplateId, docxTemplateId);
  }, [docxTemplateId]);

  return (
    <div className="container">
      <div className="page-title">Настройка генерации</div>

      <div className="card card-pad">
        <div className="section-title">Выбор Excel и DOCX</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <select
            className="input"
            style={{ width: 200 }}
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

          <select className="input" style={{ width: 420 }} value={excelTemplateId} onChange={(e) => persistExcelId(e.target.value)}>
            {!excelForYear.length ? (
              <option value="">Нет Excel для выбранного года</option>
            ) : (
              excelForYear.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.source_filename || "excel.xlsx"}
                </option>
              ))
            )}
          </select>

          <select className="input" style={{ width: 420 }} value={docxTemplateId} onChange={(e) => persistDocxId(e.target.value)}>
            {!docxTemplates.length ? (
              <option value="">Нет DOCX</option>
            ) : (
              docxTemplates.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.source_filename || "template.docx"} — {t.academic_year || ""}
                </option>
              ))
            )}
          </select>

          <div className="small">{settingsStatus}</div>
        </div>

        <div className="hr" />

        <div className="section-title" style={{ marginTop: 14 }}>
          Маппинг колонок
        </div>

        <SelectRow label="teacher_col (ФИО преподавателя)" value={cfg.columns.teacher_col} cols={cols} onChange={(v) => setOne("teacher_col", v)} />

        <SelectRow label="staff_hours_col (штатные часы)" value={cfg.columns.staff_hours_col} cols={cols} onChange={(v) => setOne("staff_hours_col", v)} />

        <SelectRow label="hourly_hours_col (почасовые часы)" value={cfg.columns.hourly_hours_col} cols={cols} onChange={(v) => setOne("hourly_hours_col", v)} />

        <div className="actions-row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={saveSettings}>
            СОХРАНИТЬ
          </button>
        </div>

        <div className="hr" style={{ marginTop: 18 }} />

        <div className="section-title" style={{ marginTop: 14 }}>
          Плейсхолдеры и blocks
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          {phStatus || blocksStatus}
        </div>

        <Section title="Стабильные: teacher.*" items={grouped.stableTeacher} copyField="example" />
        <Section title="Динамичные: row.* (из Excel)" items={grouped.dynamicRow} copyField="example" />
        <BlocksSection title="Blocks (loops)" blocks={blocksData.blocks || []} />

        <div className="actions-row" style={{ marginTop: 16 }}>
          <div className="small">
            teacher.*: {(grouped.stableTeacher || []).length} | row.*: {(grouped.dynamicRow || []).length} | blocks: {(blocksData.blocks || []).length}
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/docx-upload")}>
            ДАЛЕЕ: ЗАГРУЗИТЬ ИПП
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectRow({ label, value, cols, onChange }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
      <div style={{ width: 320, fontWeight: 700 }}>{label}</div>
      <select className="input" style={{ width: 620 }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— выбрать —</option>
        {cols.map((c) => (
          <option key={c.column_name} value={c.column_name}>
            {c.header_text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section({ title, items, copyField }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="section-title">{title}</div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Placeholder</th>
              <th>Описание</th>
              <th>Пример</th>
              <th style={{ width: 120 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="4">Нет данных</td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.placeholder_name}>
                  <td style={{ fontWeight: 800 }}>{p.placeholder_name}</td>
                  <td>{p.description || ""}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{p[copyField] || ""}</td>
                  <td>
                    <button className="btn btn-primary" onClick={() => copyToClipboard(p[copyField] || "")}>
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
      <div className="section-title">{title}</div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Block</th>
              <th>Описание</th>
              <th>Snippet</th>
              <th style={{ width: 120 }}>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!blocks.length ? (
              <tr>
                <td colSpan="4">Нет blocks</td>
              </tr>
            ) : (
              blocks.map((b) => (
                <tr key={b.key}>
                  <td style={{ fontWeight: 800 }}>{b.key}</td>
                  <td>{b.title || ""}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", whiteSpace: "pre-wrap" }}>
                    {b.snippet || ""}
                  </td>
                  <td>
                    <button className="btn btn-primary" onClick={() => copyToClipboard(b.snippet || "")}>
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
