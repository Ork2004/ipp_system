import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

function getAutoAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function currentAcademicYear() {
  return localStorage.getItem("academic_year") || getAutoAcademicYear();
}

function listForYear(list, year) {
  return (list || []).find((x) => String(x.academic_year) === String(year)) || null;
}

function roleTitle(role) {
  if (role === "admin") return "Админ";
  if (role === "teacher") return "Преподаватель";
  return "Гость";
}

function Stat({ label, value, tone = "neutral", onClick }) {
  const color =
    tone === "ok" ? "#1f8f57" : tone === "warn" ? "#b45309" : "#17356f";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        border: "1px solid #e4ebf7",
        background: "#ffffff",
        borderRadius: 12,
        padding: 18,
        minHeight: 92,
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ color: "#6f83a8", fontSize: 13, fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          color,
          fontSize: 24,
          lineHeight: 1.1,
          fontWeight: 800,
        }}
      >
        {value}
      </div>
    </button>
  );
}

function Action({ label, to, primary = false }) {
  const nav = useNavigate();

  return (
    <button
      className={primary ? "btn btn-primary" : "btn btn-outline"}
      type="button"
      onClick={() => nav(to)}
      style={{
        minWidth: 150,
        height: 46,
        borderRadius: 10,
        fontWeight: 800,
        boxShadow: primary ? "0 12px 24px rgba(58,110,255,0.18)" : "none",
      }}
    >
      {label}
    </button>
  );
}

export default function HomePage() {
  const nav = useNavigate();
  const role = localStorage.getItem("role") || "guest";
  const departmentId = Number(localStorage.getItem("department_id") || 0);
  const year = currentAcademicYear();

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [excelTemplates, setExcelTemplates] = useState([]);
  const [rawTemplates, setRawTemplates] = useState([]);
  const [form64Templates, setForm64Templates] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [history, setHistory] = useState([]);

  const excelForYear = useMemo(
    () => listForYear(excelTemplates, year),
    [excelTemplates, year]
  );
  const rawForYear = useMemo(
    () => listForYear(rawTemplates, year),
    [rawTemplates, year]
  );
  const form64ForYear = useMemo(
    () => listForYear(form64Templates, year),
    [form64Templates, year]
  );

  const me = role === "teacher" ? teachers[0] || null : null;

  useEffect(() => {
    if (role === "guest" || !departmentId) {
      return;
    }

    let ignore = false;

    async function load() {
      setLoading(true);
      setStatus("");

      const results = await Promise.allSettled([
        api.get("/excel/templates", { params: { department_id: departmentId } }),
        api.get("/raw-template/templates", {
          params: { department_id: departmentId },
        }),
        api.get("/form63/templates", { params: { department_id: departmentId } }),
        api.get("/teachers", { params: { department_id: departmentId } }),
        role === "teacher"
          ? api.get("/history", { params: { limit: 500, offset: 0 } })
          : Promise.resolve({ data: [] }),
      ]);

      if (ignore) return;

      const [excel, raw, form64, teacherList, hist] = results;
      setExcelTemplates(excel.status === "fulfilled" ? excel.value.data || [] : []);
      setRawTemplates(raw.status === "fulfilled" ? raw.value.data || [] : []);
      setForm64Templates(form64.status === "fulfilled" ? form64.value.data || [] : []);
      setTeachers(teacherList.status === "fulfilled" ? teacherList.value.data || [] : []);
      setHistory(hist.status === "fulfilled" ? hist.value.data || [] : []);

      if (results.some((x) => x.status === "rejected")) {
        setStatus("Часть данных недоступна");
      }
      setLoading(false);
    }

    load();

    return () => {
      ignore = true;
    };
  }, [role, departmentId]);

  if (role === "guest") {
    return (
      <main className="container" style={{ maxWidth: 980, paddingTop: 36 }}>
        <Header title="Просмотр" subtitle="Гость" status="" />
        <div style={panelStyle}>
          <div style={guestGridStyle}>
            <Stat label="Роль" value="Гость" />
            <Stat label="Действия" value="Только просмотр" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ maxWidth: 1180, paddingTop: 36 }}>
      <Header
        title={role === "admin" ? "Главная" : "Мой кабинет"}
        subtitle={`${roleTitle(role)} · ${year}`}
        status={loading ? "Загрузка..." : status}
      />

      {role === "teacher" && me ? (
        <div style={{ ...panelStyle, marginBottom: 18 }}>
          <div style={{ color: "#6f83a8", fontSize: 13, fontWeight: 800 }}>
            Преподаватель
          </div>
          <div
            style={{
              marginTop: 6,
              color: "#17356f",
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1.15,
            }}
          >
            {me.full_name}
          </div>
          <div style={{ marginTop: 8, color: "#5f7195", fontWeight: 600 }}>
            {[me.position, me.academic_degree, me.academic_rank]
              .filter(Boolean)
              .join(" · ") || "Профиль"}
          </div>
        </div>
      ) : null}

      <div style={panelStyle}>
        <div style={statsGridStyle}>
          <Stat
            label="Excel"
            value={excelForYear ? "Есть" : "Нет"}
            tone={excelForYear ? "ok" : "warn"}
            onClick={() => nav(role === "admin" ? "/excel-upload" : "/workload-data")}
          />
          <Stat
            label="Шаблон ИПП"
            value={rawForYear ? "Есть" : "Нет"}
            tone={rawForYear ? "ok" : "warn"}
            onClick={() => nav(role === "admin" ? "/raw-template-upload" : "/manual-tables")}
          />
          <Stat
            label={role === "admin" ? "Преподаватели" : "Файлы"}
            value={role === "admin" ? String(teachers.length) : String(history.length)}
            onClick={() => nav(role === "admin" ? "/workload-data" : "/generate")}
          />
          <Stat
            label="Форма 64"
            value={form64ForYear ? "Есть" : "Нет"}
            tone={form64ForYear ? "ok" : "warn"}
            onClick={() => nav("/form63")}
          />
        </div>

        <div className="hr" style={{ margin: "20px 0" }} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {role === "admin" ? (
            <>
              <Action label="Нагрузка" to="/excel-upload" primary={!excelForYear} />
              <Action label="Данные" to="/workload-data" />
              <Action label="Шаблон" to="/raw-template-upload" primary={!!excelForYear && !rawForYear} />
              <Action label="Настройки" to="/settings" primary={!!excelForYear && !!rawForYear} />
              <Action label="Генерация" to="/generate" />
              <Action label="Форма 64" to="/form63" />
            </>
          ) : (
            <>
              <Action label="Моя нагрузка" to="/workload-data" primary />
              <Action label="Таблицы" to="/manual-tables" />
              <Action label="Генерация" to="/generate" />
              <Action label="Форма 64" to="/form63" />
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Header({ title, subtitle, status }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 16,
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1.05,
            color: "#17356f",
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: 8, color: "#6f83a8", fontWeight: 700 }}>
          {subtitle}
        </div>
      </div>
      <div style={{ color: "#315fcb", fontWeight: 700, minHeight: 22 }}>
        {status}
      </div>
    </div>
  );
}

const panelStyle = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(30,58,138,0.08)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 14px 36px rgba(15, 23, 42, 0.07)",
};

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const guestGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};
