import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getApiBaseUrl } from "../api";

export default function AnalysisPage() {
  const [teachers, setTeachers] = useState([]);
  const [years, setYears] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [reportSummary, setReportSummary] = useState(null);
  const [reportStatus, setReportStatus] = useState("");

  const [selectedYear, setSelectedYear] = useState(
    localStorage.getItem("academic_year") || "2025-2026"
  );
  const [selectedDept, setSelectedDept] = useState("");
  const [sortBy, setSortBy] = useState("total");

  useEffect(() => {
    Promise.all([
      api.get("/analysis/years"),
      api.get("/analysis/departments"),
    ]).then(([yr, dp]) => {
      setYears(yr.data || []);
      setDepartments(dp.data || []);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async function loadData() {
    try {
      setLoading(true);
      setStatus("");
      setReportStatus("");
      const params = {};
      if (selectedYear) params.academic_year = selectedYear;
      if (selectedDept) params.department_id = selectedDept;

      const reportRequest = api
        .get("/analysis/report-summary", { params })
        .catch((error) => ({ error, data: null }));

      const [res, reportRes] = await Promise.all([
        api.get("/analysis", { params }),
        reportRequest,
      ]);

      setTeachers(res.data || []);
      if (reportRes.error) {
        setReportSummary(null);
        setReportStatus("Сводный report временно недоступен");
      } else {
        setReportSummary(reportRes.data || null);
      }
    } catch (e) {
      setStatus(e?.response?.data?.detail || "Ошибка загрузки");
      setReportSummary(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedDept]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function downloadSummaryReport() {
    if (!selectedYear) {
      setReportStatus("Выбери учебный год для отчёта");
      return;
    }
    const params = new URLSearchParams();
    params.set("academic_year", selectedYear);
    if (selectedDept) params.set("department_id", selectedDept);
    window.open(
      `${getApiBaseUrl()}/analysis/summary-report/download?${params.toString()}`,
      "_blank",
      "noreferrer"
    );
  }

  function downloadTeacherReport(teacherName) {
    if (!teacherName) return;
    if (!selectedYear) {
      setReportStatus("Выбери учебный год для отчета");
      return;
    }

    const params = new URLSearchParams();
    params.set("teacher_name", teacherName);
    params.set("academic_year", selectedYear);
    if (selectedDept) params.set("department_id", selectedDept);

    window.open(
      `${getApiBaseUrl()}/analysis/teacher-report/download?${params.toString()}`,
      "_blank",
      "noreferrer"
    );
  }

  const stats = useMemo(() => {
    const scientific = teachers.reduce((s, t) => s + (t.scientific_hours || 0), 0);
    const teaching = teachers.reduce(
      (s, t) => s + (t.teaching_auditory || 0) + (t.teaching_extraauditory || 0), 0
    );
    const total = teachers.reduce((s, t) => s + (t.total || 0), 0);
    return { scientific, teaching, total };
  }, [teachers]);

  const sorted = useMemo(() => {
    return [...teachers].sort((a, b) => {
      if (sortBy === "scientific") return (b.scientific_hours || 0) - (a.scientific_hours || 0);
      if (sortBy === "teaching")
        return ((b.teaching_auditory || 0) + (b.teaching_extraauditory || 0)) -
               ((a.teaching_auditory || 0) + (a.teaching_extraauditory || 0));
      return (b.total || 0) - (a.total || 0);
    });
  }, [teachers, sortBy]);

  const max = useMemo(() => Math.max(...teachers.map((t) => t.total || 0), 1), [teachers]);

  return (
    <div style={s.page}>

      {/* TITLE */}
      <div style={s.title}>Анализ нагрузки</div>

      {/* FILTERS */}
      <div style={s.card}>
        <div style={s.filterRow}>
          <div>
            <div style={s.label}>Учебный год</div>
            <input
              style={s.input}
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              list="years-list"
            />
            <datalist id="years-list">
              {years.map((y) => <option key={y} value={y} />)}
            </datalist>
          </div>

          <div>
            <div style={s.label}>Кафедра</div>
            <select
              style={s.input}
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="">Все кафедры</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={s.label}>Сортировка</div>
            <select
              style={s.input}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="total">По общей нагрузке</option>
              <option value="scientific">По научным часам</option>
              <option value="teaching">По учебным часам</option>
            </select>
          </div>
        </div>

        {status && <div style={s.statusErr}>{status}</div>}
        {loading && <div style={s.statusInfo}>Загрузка...</div>}
      </div>

      {/* KPI */}
      <div style={s.kpiGrid}>
        <KpiCard label="Преподаватели" value={teachers.length} />
        <KpiCard label="Научные часы" value={Math.round(stats.scientific)} />
        <KpiCard label="Учебные часы" value={Math.round(stats.teaching)} />
        <KpiCard label="Общая нагрузка" value={Math.round(stats.total)} />
      </div>

      {/* PROGRESS */}
      <div style={s.sectionTitle}>Нагрузка преподавателей</div>

      <div style={s.card}>
        {sorted.length === 0 && !loading ? (
          <div style={s.empty}>Данных пока нет</div>
        ) : (
          sorted.map((t) => {
            const total = t.total || 0;
            const pct = (total / max) * 100;
            const sciPct = ((t.scientific_hours || 0) / (total || 1)) * pct;
            const teachPct =
              (((t.teaching_auditory || 0) + (t.teaching_extraauditory || 0)) / (total || 1)) * pct;
            const restPct = Math.max(0, pct - sciPct - teachPct);

            return (
              <div key={t.id} style={s.barRow}>
                <div style={s.barHeader}>
                  <div>
                    <span style={s.barName}>{t.teacher_name}</span>
                    {t.department && (
                      <span style={s.barDept}> — {t.department}</span>
                    )}
                  </div>
                  <div style={s.barMeta}>
                    <span style={s.chip}>Науч: {Math.round(t.scientific_hours || 0)}</span>
                    <span style={s.chip}>
                      Уч: {Math.round((t.teaching_auditory || 0) + (t.teaching_extraauditory || 0))}
                    </span>
                    <span style={{ ...s.chip, fontWeight: 700, color: "#17356f" }}>
                      {Math.round(total)} ч.
                    </span>
                  </div>
                </div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barSeg, width: `${sciPct}%`, background: "#3b82f6" }} />
                  <div style={{ ...s.barSeg, width: `${teachPct}%`, background: "#60a5fa" }} />
                  <div style={{ ...s.barSeg, width: `${restPct}%`, background: "#bfdbfe" }} />
                </div>
              </div>
            );
          })
        )}

        {sorted.length > 0 && (
          <div style={s.legend}>
            <span><span style={{ color: "#3b82f6" }}>■</span> Научные</span>
            <span><span style={{ color: "#60a5fa" }}>■</span> Учебные</span>
            <span><span style={{ color: "#bfdbfe" }}>■</span> Прочие</span>
          </div>
        )}
      </div>

      {/* TABLE */}
      <div style={s.sectionTitle}>Топ преподавателей</div>

      <div style={s.card}>
        <div style={{ overflowX: "auto" }}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>№</th>
                <th style={s.th}>ФИО</th>
                <th style={s.th}>Кафедра</th>
                <th style={s.th}>Научные</th>
                <th style={s.th}>Учебные</th>
                <th style={s.th}>Всего</th>
                <th style={s.th}>Отчет</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} style={s.empty}>Файлов пока нет</td>
                </tr>
              ) : (
                sorted.slice(0, 15).map((t, i) => {
                  const teaching =
                    (t.teaching_auditory || 0) + (t.teaching_extraauditory || 0);
                  return (
                    <tr key={t.id} style={s.tr}>
                      <td style={{ ...s.td, color: "#aaa" }}>{i + 1}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{t.teacher_name}</td>
                      <td style={{ ...s.td, color: "#888" }}>{t.department || "—"}</td>
                      <td style={s.td}>{Math.round(t.scientific_hours || 0)}</td>
                      <td style={s.td}>{Math.round(teaching)}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: "#17356f" }}>
                        {Math.round(t.total || 0)}
                      </td>
                      <td style={s.td}>
                        <button
                          style={s.smallButton}
                          onClick={() => downloadTeacherReport(t.teacher_name)}
                        >
                          DOCX
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUMMARY REPORT */}
      <div style={s.sectionTitle}>Сводный отчёт</div>

      <div style={s.reportPanel}>
        {!reportSummary ? (
          <div style={s.empty}>
            {reportStatus || "Сводный отчёт появится после загрузки данных"}
          </div>
        ) : (
          <>
            {reportStatus && <div style={s.reportStatus}>{reportStatus}</div>}

            {/* Document header */}
            <div style={s.docCenter}>
              <div style={s.docTitle}>
                Сводный отчёт по нагрузке{" "}
                {(reportSummary.departments || []).join(", ") || "всех кафедр"}
              </div>
              <div style={s.docSubtitleCenter}>
                за {reportSummary.academic_year || "все годы"} учебный год
              </div>
            </div>

            <div style={s.docInfoBlock}>
              <div style={s.docInfoRow}>
                <span style={s.docInfoLabel}>Количество преподавателей:</span>{" "}
                <span style={s.docInfoValue}>{reportSummary.teachers_count}</span>
              </div>
              <div style={s.docInfoRow}>
                <span style={s.docInfoLabel}>Кафедра:</span>{" "}
                <span style={s.docInfoValue}>
                  {(reportSummary.departments || []).join(", ") || "Все кафедры"}
                </span>
              </div>
            </div>

            <div style={s.docIntro}>
              За {reportSummary.academic_year} учебный год преподавателями выполнена следующая нагрузка:
            </div>

            {/* Section 1: Teaching */}
            <div style={s.docSection}>Учебная работа</div>
            <div style={s.docItem}>
              а) Аудиторные учебные часы (лекции, практики):{" "}
              <strong>{fmtHours(reportSummary.teaching_hours)} ч.</strong>
            </div>
            <div style={s.docItem}>
              б) Прочая учебная нагрузка:{" "}
              <strong>{fmtHours(reportSummary.other_hours)} ч.</strong>
            </div>
            <div style={s.docItem}>
              в) Средняя нагрузка на преподавателя:{" "}
              <strong>{fmtHours(reportSummary.average_load)} ч.</strong>
            </div>

            <div style={{ ...s.docBlockTitle, marginTop: 14 }}>Нагрузка преподавателей:</div>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={s.th}>№</th>
                    <th style={s.th}>ФИО</th>
                    <th style={s.th}>Кафедра</th>
                    <th style={s.th}>Учебные ч.</th>
                    <th style={s.th}>Научные ч.</th>
                    <th style={s.th}>Всего ч.</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportSummary.top_teachers || []).map((t, i) => (
                    <tr key={`${t.teacher_name}-${i}`} style={s.tr}>
                      <td style={{ ...s.td, color: "#aaa" }}>{i + 1}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{t.teacher_name}</td>
                      <td style={{ ...s.td, color: "#888" }}>{t.department || "—"}</td>
                      <td style={s.td}>{fmtHours(t.teaching_hours)}</td>
                      <td style={s.td}>{fmtHours(t.scientific_hours)}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: "#17356f" }}>
                        {fmtHours(t.total_hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 2: Performance check */}
            <div style={s.docSection}>Учебная работа по проверке успеваемости обучающихся</div>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={s.th}>Учебная нагрузка</th>
                    <th style={s.th}>Учебные часы</th>
                    <th style={s.th}>Научные часы</th>
                    <th style={s.th}>Всего часов</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={s.tr}>
                    <td style={s.td}>За учебный год</td>
                    <td style={s.td}>{fmtHours(reportSummary.teaching_hours)}</td>
                    <td style={s.td}>{fmtHours(reportSummary.scientific_hours)}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>{fmtHours(reportSummary.total_hours)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Section 3: Scientific */}
            <div style={s.docSection}>Научно-исследовательская работа</div>
            <div style={s.docItem}>
              а) МООК и онлайн-курсы / НИР:{" "}
              <strong>{fmtHours(reportSummary.scientific_hours)} ч.</strong>
            </div>
            <div style={s.docItem}>б) Список публикаций: заполняется кафедрой.</div>
            <div style={s.docItem}>в) Участие в научных проектах: заполняется кафедрой.</div>

            {/* Section 4: Final summary */}
            <div style={s.docSection}>
              Итоги выполнения нагрузки преподавателей за{" "}
              {reportSummary.academic_year} учебный год
            </div>
            <div style={{ overflowX: "auto", marginBottom: 20 }}>
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={s.th}>№</th>
                    <th style={s.th}>Виды работ</th>
                    <th style={s.th}>Всего часов</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { n: "1", label: "Учебная работа / Аудиторная", val: reportSummary.teaching_hours },
                    { n: "1", label: "Учебная работа / Прочая", val: reportSummary.other_hours },
                    { n: "2", label: "Учебно-методическая работа", val: 0 },
                    { n: "3", label: "Научная работа", val: reportSummary.scientific_hours },
                    { n: "4", label: "Организационно-методическая работа", val: 0 },
                    { n: "5", label: "Воспитательная, профориентационная и общественная работа", val: 0 },
                  ].map((row, i) => (
                    <tr key={i} style={s.tr}>
                      <td style={{ ...s.td, color: "#aaa" }}>{row.n}</td>
                      <td style={s.td}>{row.label}</td>
                      <td style={s.td}>{fmtHours(row.val)}</td>
                    </tr>
                  ))}
                  <tr style={{ ...s.tr, background: "#f8faff" }}>
                    <td style={s.td} />
                    <td style={{ ...s.td, fontWeight: 700 }}>Итого</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#17356f" }}>
                      {fmtHours(reportSummary.total_hours)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Download button */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={s.copyButton} onClick={downloadSummaryReport}>
                Скачать DOCX
              </button>
            </div>
          </>
        )}
      </div>

    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={s.kpiValue}>{value}</div>
    </div>
  );
}

function fmtHours(value) {
  return Math.round(Number(value || 0)).toLocaleString("ru-RU");
}

const s = {
  page: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "28px 24px 60px",
    fontFamily: "'Segoe UI', sans-serif",
    background: "#f0f2f8",
    minHeight: "100vh",
  },
  title: {
    fontSize: 52,
    fontWeight: 800,
    color: "#17356f",
    marginBottom: 24,
    letterSpacing: "-1px",
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    padding: "24px 28px",
    marginBottom: 20,
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  },
  filterRow: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  label: {
    fontSize: 13,
    color: "#888",
    marginBottom: 6,
  },
  input: {
    height: 48,
    padding: "0 16px",
    borderRadius: 14,
    border: "1.5px solid #e8eaf2",
    background: "#f8faff",
    fontSize: 15,
    color: "#17356f",
    fontWeight: 500,
    outline: "none",
    minWidth: 180,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  statusErr: {
    marginTop: 12,
    color: "#e53e3e",
    fontSize: 14,
  },
  statusInfo: {
    marginTop: 12,
    color: "#888",
    fontSize: 14,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
    marginBottom: 20,
  },
  kpiCard: {
    background: "#fff",
    borderRadius: 16,
    padding: "18px 22px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
  },
  kpiLabel: {
    fontSize: 13,
    color: "#888",
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 800,
    color: "#17356f",
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "#17356f",
    marginBottom: 12,
  },
  barRow: {
    marginBottom: 18,
  },
  barHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    flexWrap: "wrap",
    gap: 8,
  },
  barName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#1a1a2e",
  },
  barDept: {
    fontSize: 12,
    color: "#aaa",
    fontWeight: 400,
  },
  barMeta: {
    display: "flex",
    gap: 12,
  },
  chip: {
    fontSize: 12,
    color: "#666",
  },
  barTrack: {
    width: "100%",
    height: 10,
    background: "#f0f2f8",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
  },
  barSeg: {
    height: "100%",
    transition: "width 0.4s ease",
  },
  legend: {
    display: "flex",
    gap: 20,
    marginTop: 18,
    fontSize: 12,
    color: "#888",
    paddingTop: 12,
    borderTop: "1px solid #f0f2f8",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 640,
  },
  thead: {
    background: "#f8faff",
  },
  th: {
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 700,
    color: "#555",
    borderBottom: "2px solid #eef0f8",
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: "1px solid #f4f6fb",
  },
  td: {
    padding: "12px 14px",
    fontSize: 14,
    color: "#333",
  },
  smallButton: {
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #d6e2fb",
    background: "#f8faff",
    color: "#17356f",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  empty: {
    textAlign: "center",
    padding: "32px 0",
    color: "#aaa",
    fontSize: 14,
  },
  reportPanel: {
    background: "#fff",
    borderRadius: 20,
    padding: "32px 36px",
    marginBottom: 20,
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    border: "1px solid #eef2fb",
  },
  copyButton: {
    height: 42,
    padding: "0 20px",
    borderRadius: 12,
    border: "1px solid #d6e2fb",
    background: "#f8faff",
    color: "#17356f",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  reportStatus: {
    marginBottom: 14,
    fontSize: 13,
    color: "#315fcb",
    fontWeight: 600,
  },
  docCenter: {
    textAlign: "center",
    marginBottom: 20,
  },
  docTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#17356f",
    marginBottom: 4,
  },
  docSubtitleCenter: {
    fontSize: 15,
    color: "#444",
    fontWeight: 500,
  },
  docInfoBlock: {
    background: "#f8faff",
    borderRadius: 12,
    padding: "14px 18px",
    marginBottom: 18,
    border: "1px solid #eef2fb",
    display: "flex",
    gap: 32,
    flexWrap: "wrap",
  },
  docInfoRow: {
    fontSize: 14,
    color: "#333",
  },
  docInfoLabel: {
    color: "#888",
    fontWeight: 500,
  },
  docInfoValue: {
    fontWeight: 700,
    color: "#17356f",
  },
  docIntro: {
    fontSize: 14,
    color: "#333",
    marginBottom: 18,
    fontStyle: "italic",
  },
  docSection: {
    fontSize: 15,
    fontWeight: 800,
    color: "#17356f",
    marginTop: 20,
    marginBottom: 10,
    paddingLeft: 10,
    borderLeft: "3px solid #315fcb",
  },
  docItem: {
    fontSize: 14,
    color: "#333",
    marginBottom: 6,
    paddingLeft: 10,
  },
  docBlockTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#444",
    marginBottom: 8,
  },
};
