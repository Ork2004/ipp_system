import { NavLink, useNavigate } from "react-router-dom";
import { clearSession, getRole, getRoleLabel, getToken } from "../session";

const NAV_LINKS_BY_ROLE = {
  admin: [
    { to: "/home", label: "Главная" },
    { to: "/excel-upload", label: "Нагрузка" },
    { to: "/workload-data", label: "Данные" },
    { to: "/raw-template-upload", label: "Шаблон" },
    { to: "/settings", label: "Настройки" },
    { to: "/manual-tables", label: "Таблицы" },
    { to: "/form63", label: "Форма 63" },
    { to: "/generate", label: "Генерация" },
  ],
  teacher: [
    { to: "/home", label: "Главная" },
    { to: "/workload-data", label: "Моя нагрузка" },
    { to: "/manual-tables", label: "Таблицы" },
    { to: "/form63", label: "Форма 63" },
    { to: "/generate", label: "Генерация" },
  ],
  guest: [{ to: "/home", label: "Главная" }],
};

export default function Navbar() {
  const navigate = useNavigate();

  const token = getToken();
  const role = getRole();
  const roleLabel = getRoleLabel(role);
  const links = NAV_LINKS_BY_ROLE[role] || NAV_LINKS_BY_ROLE.guest;

  function logout() {
    clearSession();
    navigate("/login");
  }

  const navItemStyle = ({ isActive }) => ({
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    padding: "0 14px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 750,
    letterSpacing: 0,
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
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {!token ? (
            <NavLink to="/login" style={navItemStyle}>
              Вход
            </NavLink>
          ) : (
            <>
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} style={navItemStyle}>
                  {link.label}
                </NavLink>
              ))}
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
                  height: 42,
                  padding: "0 14px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 750,
                  letterSpacing: 0,
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
                {roleLabel}
              </div>

              <button
                className="btn btn-outline"
                onClick={logout}
                style={{
                  height: 42,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.22)",
                  background: "rgba(255,255,255,0.14)",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 750,
                  letterSpacing: 0,
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
