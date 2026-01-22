import { NavLink, useNavigate} from "react-router-dom";

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
    navigate("/login");
  }

  return (
    <div className="navbar">
      <div className="navbar-inner">
        <div className="navlinks">
          {!token && (
            <NavLink to="/login" className={linkClass}>
              Вход
            </NavLink>
          )}

          {token && (
            <>
              {role === "admin" && (
                <>
                  <NavLink to="/excel-upload" className={linkClass}>
                    Нагрузка
                  </NavLink>
                  <NavLink to="/workload-data" className={linkClass}>
                    Данные
                  </NavLink>
                  <NavLink to="/docx-upload" className={linkClass}>
                    DOCX
                  </NavLink>
                  <NavLink to="/settings" className={linkClass}>
                    Настройка
                  </NavLink>
                </>
              )}

              <NavLink to="/generate" className={linkClass}>
                Генерация
              </NavLink>
            </>
          )}
        </div>

        <div className="nav-right">
          {token && (
            <>
              <div className="pill">{role}</div>
              <button className="btn btn-outline" onClick={logout}>
                Выйти
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
