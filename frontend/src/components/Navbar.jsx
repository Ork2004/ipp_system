import { NavLink, useNavigate } from "react-router-dom";

export default function Navbar() {
  const navigate = useNavigate();

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") || "guest";

  const linkClass = ({ isActive }) => (isActive ? "active" : "");

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("teacher_id");
    localStorage.removeItem("department_id");
    localStorage.removeItem("excel_template_id");
    localStorage.removeItem("docx_template_id");
    localStorage.removeItem("academic_year");
    navigate("/login");
  }

  return (
    <div className="navbar">
      <div className="navbar-inner">
        <div className="navlinks">
          {!token ? (
            <NavLink to="/login" className={linkClass}>
              Вход
            </NavLink>
          ) : (
            <>
              {role === "admin" ? (
                <>
                  <NavLink to="/excel-upload" className={linkClass}>
                    Нагрузка
                  </NavLink>
                  <NavLink to="/workload-data" className={linkClass}>
                    Данные
                  </NavLink>
                  <NavLink to="/raw-template-upload" className={linkClass}>
                    Raw шаблон
                  </NavLink>
                  <NavLink to="/manual-tables" className={linkClass}>
                    Таблицы
                  </NavLink>
                  <NavLink to="/settings" className={linkClass}>
                    Настройка
                  </NavLink>
                  <NavLink to="/docx-upload" className={linkClass}>
                    ИПП
                  </NavLink>
                </>
              ) : null}

              <NavLink to="/generate" className={linkClass}>
                Генерация
              </NavLink>
            </>
          )}
        </div>

        <div className="nav-right">
          {token ? (
            <>
              <div className="pill">{role}</div>
              <button className="btn btn-outline" onClick={logout}>
                Выйти
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
