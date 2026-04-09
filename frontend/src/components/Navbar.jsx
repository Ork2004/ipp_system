import { NavLink, useNavigate } from "react-router-dom";

export default function Navbar() {
  const navigate = useNavigate();

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") || "guest";

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("teacher_id");
    localStorage.removeItem("department_id");
    localStorage.removeItem("excel_template_id");
    localStorage.removeItem("docx_template_id");
    localStorage.removeItem("raw_template_id");
    localStorage.removeItem("academic_year");
    navigate("/login");
  }

  const navItemStyle = ({ isActive }) => ({
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    padding: "0 18px",
    borderRadius: 14,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.01em",
    color: "#ffffff",
    background: isActive ? "rgba(255,255,255,0.20)" : "transparent",
    border: isActive
      ? "1px solid rgba(255,255,255,0.24)"
      : "1px solid transparent",
    boxShadow: isActive ? "inset 0 1px 0 rgba(255,255,255,0.10)" : "none",
    transition: "all 0.18s ease",
    whiteSpace: "nowrap",
  });

  return (
    <div className="navbar">
      <div
        className="navbar-inner"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div
          className="navlinks"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {!token ? (
            <NavLink to="/login" style={navItemStyle}>
              Вход
            </NavLink>
          ) : (
            <>
              {role === "admin" ? (
                <>
                  <NavLink to="/excel-upload" style={navItemStyle}>
                    Нагрузка
                  </NavLink>

                  <NavLink to="/workload-data" style={navItemStyle}>
                    Данные
                  </NavLink>
                
                  <NavLink to="/raw-template-upload" style={navItemStyle}>
                    Шаблон
                  </NavLink>

                  <NavLink to="/settings" style={navItemStyle}>
                    Настройка
                  </NavLink>

                  <NavLink to="/manual-tables" style={navItemStyle}>
                    Таблицы
                  </NavLink>
                </>
              ) : null}

              <NavLink to="/generate" style={navItemStyle}>
                Генерация
              </NavLink>
            </>
          )}
        </div>

        <div
          className="nav-right"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {token ? (
            <>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  height: 46,
                  padding: "0 18px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#8CF3C9",
                    boxShadow: "0 0 8px rgba(140,243,201,0.9)",
                    flexShrink: 0,
                  }}
                />
                {role}
              </div>

              <button
                className="btn btn-outline"
                onClick={logout}
                style={{
                  height: 46,
                  padding: "0 18px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.22)",
                  background: "rgba(255,255,255,0.14)",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "0.01em",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Выйти
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}