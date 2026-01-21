import { NavLink } from "react-router-dom";

export default function Navbar() {
  const linkClass = ({ isActive }) => (isActive ? "active" : "");

  return (
    <div className="navbar">
      <div className="navbar-inner">
        <div className="navlinks">
          <NavLink to="/excel-upload" className={linkClass}>Нагрузка</NavLink>
          <NavLink to="/workload-data" className={linkClass}>Данные</NavLink>
          <NavLink to="/docx-upload" className={linkClass}>DOCX</NavLink>
          <NavLink to="/settings" className={linkClass}>Настройка</NavLink>
          <NavLink to="/generate" className={linkClass}>Генерация</NavLink>
        </div>
      </div>
    </div>
  );
}
