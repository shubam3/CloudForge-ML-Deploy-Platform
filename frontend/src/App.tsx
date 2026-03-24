import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import UploadModel from "./pages/UploadModel";
import ModelsList from "./pages/ModelsList";
import ModelDetails from "./pages/ModelDetails";

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">ML Deploy</div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/upload" className={({ isActive }) => (isActive ? "active" : "")}>
            Upload
          </NavLink>
          <NavLink to="/models" className={({ isActive }) => (isActive ? "active" : "")}>
            Models
          </NavLink>
        </nav>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadModel />} />
          <Route path="/models" element={<ModelsList />} />
          <Route path="/models/:id" element={<ModelDetails />} />
        </Routes>
      </main>
    </div>
  );
}

