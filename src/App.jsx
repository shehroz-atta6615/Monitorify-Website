import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import HomePage from "./pages/HomePage.jsx";
import ProjectPage from "./pages/ProjectPage.jsx";
import MonitorsPage from "./pages/MonitorsPage.jsx";

const LS_KEY = "siterelic_guest_project";

function RedirectLastProject() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return navigate("/", { replace: true });
      const data = JSON.parse(raw);
      if (!data?.projectId) return navigate("/", { replace: true });
      navigate(`/p/${data.projectId}`, { replace: true });
    } catch {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/p" element={<RedirectLastProject />} />
      <Route path="/p/:projectId" element={<ProjectPage />} />
       <Route path="/p/:projectId/monitors" element={<MonitorsPage />} />

       
      <Route path="*" element={<Navigate to="/" replace />} />

     
    </Routes>
  );
}
