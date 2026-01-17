import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const router = Router();

router.get("/rooms", (req, res) => {
  const { rooms } = req.app.locals.store;
  res.json({
    rooms: Array.from(rooms.values())
  });
});

router.post("/rooms", (req, res) => {
  const { title, teacherName } = req.body;
  if (!title || !teacherName) {
    return res.status(400).json({ message: "Missing room title or teacher name" });
  }
  const { rooms, getRoomState, getRoomFiles } = req.app.locals.store;
  const { updateRoomsMetric } = req.app.locals.metrics;
  const id = nanoid(8);
  const room = {
    id,
    title,
    teacherName,
    createdAt: new Date().toISOString()
  };
  rooms.set(id, room);
  getRoomState(id);
  getRoomFiles(id);
  updateRoomsMetric();
  res.status(201).json({ room });
});

router.get("/rooms/:roomId", (req, res) => {
  const { rooms } = req.app.locals.store;
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }
  res.json({ room });
});

router.get("/rooms/:roomId/files", (req, res) => {
  const { rooms, getRoomFiles } = req.app.locals.store;
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }
  const files = getRoomFiles(req.params.roomId).map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    mime: file.mime,
    uploadedAt: file.uploadedAt
  }));
  res.json({ files });
});

router.post("/rooms/:roomId/files", upload.single("file"), (req, res) => {
  const { rooms, getRoomFiles } = req.app.locals.store;
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }
  if (!req.file) {
    return res.status(400).json({ message: "File is required" });
  }
  const safeName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const entry = {
    id: nanoid(10),
    name: safeName,
    size: req.file.size,
    mime: req.file.mimetype,
    uploadedAt: new Date().toISOString(),
    buffer: req.file.buffer
  };
  getRoomFiles(req.params.roomId).push(entry);
  res.status(201).json({
    file: {
      id: entry.id,
      name: entry.name,
      size: entry.size,
      mime: entry.mime,
      uploadedAt: entry.uploadedAt
    }
  });
});

router.get("/rooms/:roomId/files/:fileId", (req, res) => {
  const { rooms, getRoomFiles } = req.app.locals.store;
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }
  const file = getRoomFiles(req.params.roomId).find((item) => item.id === req.params.fileId);
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }
  const encodedName = encodeURIComponent(file.name).replace(/'/g, "%27");
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Length", file.size);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.name}"; filename*=UTF-8''${encodedName}`
  );
  res.send(file.buffer);
});

router.delete("/rooms/:roomId/files/:fileId", (req, res) => {
  const { rooms, getRoomFiles } = req.app.locals.store;
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }
  const files = getRoomFiles(req.params.roomId);
  const index = files.findIndex((item) => item.id === req.params.fileId);
  if (index === -1) {
    return res.status(404).json({ message: "File not found" });
  }
  files.splice(index, 1);
  res.status(204).send();
});

export default router;
