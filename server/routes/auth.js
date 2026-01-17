import { Router } from "express";

const router = Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const safeUser = String(username || "").trim().toLowerCase();
  const safePass = String(password || "").trim();
  if (safeUser === "yokyay" && safePass === "461225") {
    return res.json({
      user: { name: "yokyay", role: "Teacher" }
    });
  }
  return res.status(401).json({ message: "Invalid credentials" });
});

export default router;
