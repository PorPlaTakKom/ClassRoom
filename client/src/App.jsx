import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Classroom from "./pages/Classroom.jsx";
import NotFound from "./pages/NotFound.jsx";
import { getStoredUser } from "./lib/storage.js";

export default function App() {
  const location = useLocation();
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    setUser(getStoredUser());
  }, [location.pathname]);

  return (
    <div className="min-h-screen gradient-shell text-ink-900">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route
          path="/dashboard"
          element={user ? <Dashboard user={user} /> : <Navigate to="/login" replace />}
        />
        <Route path="/classroom/:roomId" element={<Classroom user={user} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
