import express from "express";
import cors from "cors";
import http from "http";
import https from "https";
import fs from "fs";
import multer from "multer";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import promClient from "prom-client";

const app = express();
const sslKeyPath = process.env.SSL_KEY;
const sslCertPath = process.env.SSL_CERT;
const server =
  sslKeyPath && sslCertPath
    ? https.createServer(
        {
          key: fs.readFileSync(sslKeyPath),
          cert: fs.readFileSync(sslCertPath)
        },
        app
      )
    : http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestsTotal = new promClient.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register]
});

const socketConnections = new promClient.Gauge({
  name: "socket_connections_active",
  help: "Active socket connections",
  registers: [register],
  collect() {
    this.set(io.engine.clientsCount);
  }
});

const studentsActive = new promClient.Gauge({
  name: "students_active",
  help: "Active approved students",
  registers: [register],
  collect() {
    let studentCount = 0;
    roomState.forEach((state) => {
      studentCount += state.approved.size;
    });
    this.set(studentCount);
  }
});

const teachersActive = new promClient.Gauge({
  name: "teachers_active",
  help: "Active teachers",
  registers: [register],
  collect() {
    let teacherCount = 0;
    roomState.forEach((state) => {
      if (state.teacherSocketId) teacherCount += 1;
    });
    this.set(teacherCount);
  }
});

const roomsActive = new promClient.Gauge({
  name: "rooms_active",
  help: "Active rooms",
  registers: [register],
  collect() {
    this.set(rooms.size);
  }
});

const updateRoomsMetric = () => {
  roomsActive.collect();
};

const updateRoleMetrics = () => {
  teachersActive.collect();
  studentsActive.collect();
  socketConnections.collect();
};

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  res.on("finish", () => {
    const route = req.route?.path || req.path || "unknown";
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: String(res.statusCode)
    });
  });
  next();
});

const rooms = new Map();
const roomState = new Map();
const filesByRoom = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const normalizeUserKey = (user) => {
  if (!user?.name) return null;
  const key = user.name.trim().toLowerCase();
  return key.length > 0 ? key : null;
};

const getRoomState = (roomId) => {
  if (!roomState.has(roomId)) {
    roomState.set(roomId, {
      teacherSocketId: null,
      pending: new Map(),
      approved: new Map(),
      approvedUsers: new Set(),
      messages: []
    });
  }
  return roomState.get(roomId);
};

const getRoomFiles = (roomId) => {
  if (!filesByRoom.has(roomId)) {
    filesByRoom.set(roomId, []);
  }
  return filesByRoom.get(roomId);
};

const emitApprovedList = (roomId) => {
  const state = roomState.get(roomId);
  if (!state) return;
  io.to(roomId).emit("approved-list", {
    approved: Array.from(state.approved.values())
  });
};

app.get("/api/rooms", (req, res) => {
  res.json({
    rooms: Array.from(rooms.values())
  });
});

app.post("/api/login", (req, res) => {
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

app.post("/api/rooms", (req, res) => {
  const { title, teacherName } = req.body;
  if (!title || !teacherName) {
    return res.status(400).json({ message: "Missing room title or teacher name" });
  }
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

app.get("/api/rooms/:roomId", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }
  res.json({ room });
});

app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.get("/api/rooms/:roomId/files", (req, res) => {
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

app.post("/api/rooms/:roomId/files", upload.single("file"), (req, res) => {
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

app.get("/api/rooms/:roomId/files/:fileId", (req, res) => {
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

app.delete("/api/rooms/:roomId/files/:fileId", (req, res) => {
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

io.on("connection", (socket) => {
  console.log(`[SOCKET] connected ${socket.id}`);
  updateRoleMetrics();
  socket.on("join-room", ({ roomId, user }) => {
    console.log(`[SOCKET] join-room ${roomId} by ${user?.name} (${user?.role})`);
    const room = rooms.get(roomId);
    if (!room || user?.role !== "Teacher") return;

    const state = getRoomState(roomId);
    state.teacherSocketId = socket.id;

    socket.join(roomId);
    socket.emit("chat-history", { messages: state.messages });
    socket.emit("pending-list", {
      pending: Array.from(state.pending.values())
    });
    emitApprovedList(roomId);
    updateRoleMetrics();
  });

  socket.on("request-join", ({ roomId, user }) => {
    console.log(`[SOCKET] request-join ${roomId} by ${user?.name}`);
    const room = rooms.get(roomId);
    if (!room || user?.role !== "Student") return;

    const state = getRoomState(roomId);
    const userKey = normalizeUserKey(user);
    if (userKey && state.approvedUsers.has(userKey)) {
      socket.join(roomId);
      state.approved.set(socket.id, { socketId: socket.id, user });
      socket.emit("join-approved", { roomId });
      socket.emit("chat-history", { messages: state.messages });
      emitApprovedList(roomId);
      updateRoleMetrics();
      return;
    }
    const request = {
      socketId: socket.id,
      user
    };

    state.pending.set(socket.id, request);

    if (state.teacherSocketId) {
      io.to(state.teacherSocketId).emit("join-request", {
        pending: Array.from(state.pending.values())
      });
    }
  });

  socket.on("approve-join", ({ roomId, socketId }) => {
    console.log(`[SOCKET] approve-join ${roomId} for ${socketId}`);
    const state = getRoomState(roomId);
    if (state.teacherSocketId !== socket.id) return;

    const request = state.pending.get(socketId);
    if (!request) return;

    state.pending.delete(socketId);
    const userKey = normalizeUserKey(request.user);
    if (userKey) {
      state.approvedUsers.add(userKey);
    }
    state.approved.set(socketId, request);
    const studentSocket = io.sockets.sockets.get(socketId);
    if (studentSocket) {
      studentSocket.join(roomId);
      studentSocket.emit("join-approved", { roomId });
      studentSocket.emit("chat-history", { messages: state.messages });
    }
    updateRoleMetrics();

    io.to(state.teacherSocketId).emit("join-request", {
      pending: Array.from(state.pending.values())
    });
    io.to(state.teacherSocketId).emit("student-approved", {
      roomId,
      socketId,
      user: request.user
    });
    emitApprovedList(roomId);
  });

  socket.on("chat-message", ({ roomId, message, user }) => {
    console.log(`[SOCKET] chat-message ${roomId} by ${user?.name}`);
    if (!roomId || !message || !user) return;
    if (!socket.rooms.has(roomId)) return;

    const state = getRoomState(roomId);
    const payload = {
      user,
      message,
      timestamp: new Date().toISOString()
    };
    state.messages.push(payload);
    io.to(roomId).emit("chat-message", payload);
  });

  socket.on("speaking", ({ roomId, user, speaking }) => {
    if (!roomId || !user?.name) return;
    if (!socket.rooms.has(roomId)) return;
    io.to(roomId).emit("speaking", {
      name: user.name,
      speaking: Boolean(speaking)
    });
  });

  socket.on("teacher-ready", ({ roomId }) => {
    console.log(`[SOCKET] teacher-ready ${roomId}`);
    const state = getRoomState(roomId);
    if (state.teacherSocketId !== socket.id) return;
    socket.emit("approved-list", {
      approved: Array.from(state.approved.values())
    });
  });

  socket.on("webrtc-offer", ({ targetId, offer, roomId }) => {
    console.log(`[SOCKET] webrtc-offer ${roomId} -> ${targetId}`);
    if (!targetId || !offer) return;
    io.to(targetId).emit("webrtc-offer", {
      from: socket.id,
      offer,
      roomId
    });
  });

  socket.on("webrtc-answer", ({ targetId, answer }) => {
    console.log(`[SOCKET] webrtc-answer -> ${targetId}`);
    if (!targetId || !answer) return;
    io.to(targetId).emit("webrtc-answer", {
      from: socket.id,
      answer
    });
  });

  socket.on("webrtc-ice", ({ targetId, candidate }) => {
    console.log(`[SOCKET] webrtc-ice -> ${targetId}`);
    if (!targetId || !candidate) return;
    io.to(targetId).emit("webrtc-ice", {
      from: socket.id,
      candidate
    });
  });

  socket.on("webrtc-stop", ({ roomId }) => {
    console.log(`[SOCKET] webrtc-stop ${roomId}`);
    if (!roomId) return;
    io.to(roomId).emit("webrtc-stop", { roomId });
  });

  socket.on("camera-stop", ({ roomId }) => {
    console.log(`[SOCKET] camera-stop ${roomId} by ${socket.id}`);
    if (!roomId) return;
    io.to(roomId).emit("camera-stop", { roomId, socketId: socket.id });
  });

  socket.on("close-class", ({ roomId }) => {
    console.log(`[SOCKET] close-class ${roomId}`);
    if (!roomId) return;
    const state = getRoomState(roomId);
    if (state.teacherSocketId !== socket.id) return;
    io.to(roomId).emit("class-closed", { roomId });
    rooms.delete(roomId);
    roomState.delete(roomId);
    filesByRoom.delete(roomId);
    updateRoomsMetric();
    updateRoleMetrics();
    io.emit("room-removed", { roomId });
  });

  socket.on("disconnect", () => {
    console.log(`[SOCKET] disconnected ${socket.id}`);
    roomState.forEach((state) => {
      if (state.teacherSocketId === socket.id) {
        state.teacherSocketId = null;
      }
      if (state.pending.has(socket.id)) {
        state.pending.delete(socket.id);
      }
      if (state.approved.has(socket.id)) {
        state.approved.delete(socket.id);
      }
    });
    updateRoleMetrics();
    roomState.forEach((state, roomId) => {
      if (state) emitApprovedList(roomId);
    });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  updateRoomsMetric();
  updateRoleMetrics();
});
