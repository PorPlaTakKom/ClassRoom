import express from "express";
import cors from "cors";
import http from "http";
import https from "https";
import fs from "fs";
import { Server } from "socket.io";
import authRouter from "./routes/auth.js";
import livekitRouter from "./routes/livekit.js";
import roomsRouter from "./routes/rooms.js";
import { createMetrics } from "./metrics.js";
import {
  rooms,
  roomState,
  filesByRoom,
  normalizeUserKey,
  getRoomFiles,
  getRoomState,
  emitApprovedList
} from "./store.js";
import { registerSocketHandlers } from "./socket.js";

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

const metrics = createMetrics(io, roomState, rooms);

app.use(cors());
app.use(express.json());
app.use(metrics.metricsMiddleware);

app.locals.store = {
  rooms,
  roomState,
  filesByRoom,
  normalizeUserKey,
  getRoomFiles,
  getRoomState
};
app.locals.metrics = metrics;

app.use("/api", authRouter);
app.use("/api", livekitRouter);
app.use("/api", roomsRouter);

app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

registerSocketHandlers(io, {
  rooms,
  roomState,
  filesByRoom,
  getRoomState,
  normalizeUserKey,
  emitApprovedList,
  updateRoleMetrics: metrics.updateRoleMetrics,
  updateRoomsMetric: metrics.updateRoomsMetric
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  metrics.updateRoomsMetric();
  metrics.updateRoleMetrics();
});
