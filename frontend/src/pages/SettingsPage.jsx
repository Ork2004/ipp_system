import { useEffect, useState } from "react";
import { api } from "../api";

export default function SettingsPage() {
  const [excelTemplateId, setExcelTemplateId] = useState(localStorage.getItem("excel_template_id") || "");
  const [docxTemplateId, setDocxTemplateId] = useState(localStorage.getItem("docx_template_id") || "");

  const [cols, setCols] = useState([]);
  const [status, setStatus] = useState("");

  const [cfg, setCfg] = useState({
    columns: {
      teacher_col: "",
      sem1_col: "",
      sem2_col: "",
      staff_hours_col: "",
      hourly_hours_cols: [],
    }
  });

  async function loadColumns() {
    if (!excelTemplateId) {
      setStatus("Нет excel_template_id");
      return;
    }
    try {
      setStatus("Загрузка колонок Excel...");
      const res = await api.get(`/excel/${excelTemplateId}/columns`);
      setCols(res.data || []);
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Ошибка загрузки колонок");
    }
  }

  async function loadCurrent() {
    if (!excelTemplateId || !docxTemplateId) return;
    try {
      const res = await api.get("/settings/current", {
        params: { excel_template_id: excelTemplateId, docx_template_id: docxTemplateId }
      });
      if (res.data?.exists) setCfg(res.data.config);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    loadColumns();
    loadCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setOne(key, value) {
    setCfg(prev => ({ ...prev, columns: { ...prev.columns, [key]: value } }));
  }

  function toggleHourly(colName) {
    setCfg(prev => {
      const list = prev.columns.hourly_hours_cols || [];
      const has = list.includes(colName);
      const next = has ? list.filter(x => x !== colName) : [...list, colName];
      return { ...prev, columns: { ...prev.columns, hourly_hours_cols: next } };
    });
  }

  async function save() {
    if (!excelTemplateId || !docxTemplateId) {
      setStatus("Нужно указать excel_template_id и docx_template_id");
      return;
    }
    const c = cfg.columns || {};
    if (!c.teacher_col || !c.sem1_col || !c.sem2_col || !c.staff_hours_col) {
      setStatus("Обязательные: teacher_col, sem1_col, sem2_col, staff_hours_col");
      return;
    }
    try {
      setStatus("Сохранение...");
      const res = await api.post("/settings/save", {
        excel_template_id: Number(excelTemplateId),
        docx_template_id: Number(docxTemplateId),
        config: cfg
      });
      setStatus(`Сохранено ✅ settings_id=${res.data.settings_id}`);
    } catch (e) {
      console.error(e);
      setStatus(e?.response?.data?.detail || "Ошибка сохранения");
    }
  }

  return (
    <div className="container">
      <div className="page-title">Настройка генерации (пара Excel + DOCX)</div>

      <div className="card card-pad">
        <div className="section-title">IDs</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <input
            className="input"
            style={{ width: 220 }}
            value={excelTemplateId}
            onChange={(e) => {
              setExcelTemplateId(e.target.value);
              localStorage.setItem("excel_template_id", e.target.value);
            }}
            placeholder="excel_template_id"
          />
          <input
            className="input"
            style={{ width: 220 }}
            value={docxTemplateId}
            onChange={(e) => {
              setDocxTemplateId(e.target.value);
              localStorage.setItem("docx_template_id", e.target.value);
            }}
            placeholder="docx_template_id"
          />
          <button className="btn btn-outline" onClick={loadColumns}>Загрузить колонки</button>
          <div className="small">{status}</div>
        </div>

        <div className="hr" />

        <div className="section-title">Обязательные привязки (по column_name)</div>

        <SelectRow
          label="teacher_col (колонка ФИО)"
          value={cfg.columns.teacher_col}
          cols={cols}
          onChange={(v) => setOne("teacher_col", v)}
        />
        <SelectRow
          label="sem1_col (колонка 1 семестр)"
          value={cfg.columns.sem1_col}
          cols={cols}
          onChange={(v) => setOne("sem1_col", v)}
        />
        <SelectRow
          label="sem2_col (колонка 2 семестр)"
          value={cfg.columns.sem2_col}
          cols={cols}
          onChange={(v) => setOne("sem2_col", v)}
        />
        <SelectRow
          label="staff_hours_col (колонка штатной нагрузки)"
          value={cfg.columns.staff_hours_col}
          cols={cols}
          onChange={(v) => setOne("staff_hours_col", v)}
        />

        <div className="hr" style={{ marginTop: 14 }} />

        <div className="section-title">hourly_hours_cols (почасовые колонки)</div>
        <div className="small" style={{ marginBottom: 10 }}>
          Отметь какие column_name суммируются как почасовая нагрузка.
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>column_name</th>
                <th>header_text</th>
                <th style={{ width: 120 }}>Включить</th>
              </tr>
            </thead>
            <tbody>
              {cols.map(c => (
                <tr key={c.column_name}>
                  <td style={{ fontWeight: 800 }}>{c.column_name}</td>
                  <td>{c.header_text}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={(cfg.columns.hourly_hours_cols || []).includes(c.column_name)}
                      onChange={() => toggleHourly(c.column_name)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="actions-row" style={{ marginTop: 16 }}>
          <div className="small">
            Сохраняется на пару: Excel #{excelTemplateId} + DOCX #{docxTemplateId}
          </div>
          <button className="btn btn-primary" onClick={save}>СОХРАНИТЬ</button>
        </div>
      </div>
    </div>
  );
}

function SelectRow({ label, value, cols, onChange }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
      <div style={{ width: 360, fontWeight: 700 }}>{label}</div>
      <select className="input" style={{ width: 520 }} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— выбрать —</option>
        {cols.map(c => (
          <option key={c.column_name} value={c.column_name}>
            {c.column_name} — {c.header_text}
          </option>
        ))}
      </select>
    </div>
  );
}
