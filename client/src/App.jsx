import { Navigate, Route, Routes } from "react-router-dom";
import { useSelector } from "react-redux";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Classroom from "./pages/Classroom.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  const user = useSelector((state) => state.auth.user);

  return (
    <div className="min-h-screen gradient-shell text-ink-900">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={user ? <Dashboard /> : <Navigate to="/login" replace />}
        />
        <Route path="/classroom/:roomId" element={<Classroom />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
