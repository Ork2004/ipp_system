import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function AnalysisPage() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const res = await api.get("/form63"); // твой endpoint
      setTeachers(res.data || []);
      setStatus("");
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  // ================= STATS =================
  const stats = useMemo(() => {
    const scientific = teachers.reduce(
      (s, t) => s + (Number(t.scientific_hours) || 0),
      0
    );

    const teaching = teachers.reduce(
      (s, t) =>
        s +
        (Number(t.teaching_auditory) || 0) +
        (Number(t.teaching_extraauditory) || 0),
      0
    );

    return {
      scientific,
      teaching,
      total: scientific + teaching,
    };
  }, [teachers]);

  // ================= SORT =================
  const sorted = useMemo(() => {
    return [...teachers].sort((a, b) => {
      const aTotal =
        (Number(a.scientific_hours) || 0) +
        (Number(a.teaching_auditory) || 0) +
        (Number(a.teaching_extraauditory) || 0);

      const bTotal =
        (Number(b.scientific_hours) || 0) +
        (Number(b.teaching_auditory) || 0) +
        (Number(b.teaching_extraauditory) || 0);

      return bTotal - aTotal;
    });
  }, [teachers]);

  // ================= MAX =================
  const max = useMemo(() => {
    return Math.max(
      ...teachers.map((t) => {
        return (
          (Number(t.scientific_hours) || 0) +
          (Number(t.teaching_auditory) || 0) +
          (Number(t.teaching_extraauditory) || 0)
        );
      }),
      1
    );
  }, [teachers]);

  return (
    <div
      className="container"
      style={{ maxWidth: 1280, paddingTop: 28, paddingBottom: 40 }}
    >
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          marginBottom: 24,
          color: "#17356f",
        }}
      >
        Анализ нагрузки
      </div>

      {/* STATUS */}
      <div style={{ marginBottom: 16, color: "#666" }}>
        {loading ? "Загрузка..." : status}
      </div>

      {/* KPI CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <Card title="Преподаватели" value={teachers.length} />
        <Card title="Научные часы" value={stats.scientific} />
        <Card title="Учебные часы" value={stats.teaching} />
        <Card title="Общая нагрузка" value={stats.total} />
      </div>

      {/* PROGRESS LIST */}
      <div
        className="card"
        style={{
          borderRadius: 28,
          padding: 24,
          background: "rgba(255,255,255,0.94)",
          boxShadow: "0 16px 50px rgba(0,0,0,0.08)",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            marginBottom: 18,
          }}
        >
          Нагрузка преподавателей
        </div>

        {sorted.map((t) => {
          const total =
            (Number(t.scientific_hours) || 0) +
            (Number(t.teaching_auditory) || 0) +
            (Number(t.teaching_extraauditory) || 0);

          const percent = (total / max) * 100;

          let color = "#22c55e";
          if (total > 120) color = "#ef4444";
          else if (total > 80) color = "#f59e0b";

          return (
            <div key={t.id} style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <div>{t.teacher_name}</div>
                <div>{total} ч.</div>
              </div>

              <div
                style={{
                  width: "100%",
                  height: 10,
                  background: "#eee",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${percent}%`,
                    height: "100%",
                    background: color,
                    transition: "0.3s",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* TABLE */}
      <div
        className="card"
        style={{
          borderRadius: 28,
          padding: 24,
          background: "rgba(255,255,255,0.94)",
          boxShadow: "0 16px 50px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            marginBottom: 16,
          }}
        >
          Топ преподавателей
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f5f7fb" }}>
              <th style={th}>ФИО</th>
              <th style={th}>Научные</th>
              <th style={th}>Учебные</th>
              <th style={th}>Всего</th>
            </tr>
          </thead>

          <tbody>
            {sorted.slice(0, 10).map((t) => {
              const total =
                (Number(t.scientific_hours) || 0) +
                (Number(t.teaching_auditory) || 0) +
                (Number(t.teaching_extraauditory) || 0);

              return (
                <tr key={t.id}>
                  <td style={td}>{t.teacher_name}</td>
                  <td style={td}>{t.scientific_hours}</td>
                  <td style={td}>
                    {(Number(t.teaching_auditory) || 0) +
                      (Number(t.teaching_extraauditory) || 0)}
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= CARD ================= */
function Card({ title, value }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 16,
        background: "white",
        border: "1px solid #eee",
      }}
    >
      <div style={{ fontSize: 13, color: "#666" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

/* ================= STYLES ================= */
const th = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #ddd",
  fontSize: 14,
};

const td = {
  padding: 10,
  borderBottom: "1px solid #eee",
  fontSize: 14,
};