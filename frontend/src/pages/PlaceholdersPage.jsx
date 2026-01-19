import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
}

export default function PlaceholdersPage() {
  const navigate = useNavigate();
  const [excelTemplateId, setExcelTemplateId] = useState(localStorage.getItem("excel_template_id") || "");
  const [data, setData] = useState({ stable: [], dynamic: [] });
  const [status, setStatus] = useState("");

  const grouped = useMemo(() => {
    const stableTeacher = (data.stable || []).filter(i => i.category === "teacher");
    const stableLoop = (data.stable || []).filter(i => i.category === "loop");
    const dynamicRow = data.dynamic || [];
    return { stableTeacher, stableLoop, dynamicRow };
  }, [data]);

  async function load() {
    if (!excelTemplateId) {
      setStatus("Нет excel_template_id. Сначала загрузи Excel.");
      return;
    }
    try {
      setStatus("Загрузка плейсхолдеров...");
      const res = await api.get("/placeholders", { params: { excel_template_id: excelTemplateId } });
      setData(res.data || { stable: [], dynamic: [] });
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Ошибка: плейсхолдеры не загрузились");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <div className="page-title">Плейсхолдеры (Excel → row.*)</div>

      <div className="card card-pad">
        <div className="section-title">Excel шаблон</div>

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
          <button className="btn btn-outline" onClick={load}>Обновить</button>
          <div className="small">{status}</div>
        </div>

        <div className="hr" />

        <div className="small" style={{ marginBottom: 14 }}>
          Инструкция: открой DOCX в Word → в нужные места вставь плейсхолдеры.
          <br />
          <b>Стабильные:</b> teacher.* и loops. <b>Динамичные:</b> row.* (строго из выбранного Excel).
          <br />
          После вставки перейди на вкладку <b>DOCX</b> и загрузи шаблон (он свяжется с этим Excel).
        </div>

        <Section title="Стабильные: teacher.*" items={grouped.stableTeacher} />
        <Section title="Стабильные: loops" items={grouped.stableLoop} />
        <Section title="Динамичные: row.* (из Excel)" items={grouped.dynamicRow} />

        <div className="actions-row" style={{ marginTop: 16 }}>
          <div className="small">
            Stable: {(data.stable || []).length} | Dynamic: {(data.dynamic || []).length}
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/docx-upload")}>
            ДАЛЕЕ: ЗАГРУЗИТЬ DOCX
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items }) {
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
              <tr><td colSpan="4">Нет данных</td></tr>
            ) : (
              items.map((p) => (
                <tr key={p.placeholder_name}>
                  <td style={{ fontWeight: 800 }}>{p.placeholder_name}</td>
                  <td>{p.description || ""}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {p.example || ""}
                  </td>
                  <td>
                    <button className="btn btn-primary" onClick={() => copyToClipboard(p.example || "")}>
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
