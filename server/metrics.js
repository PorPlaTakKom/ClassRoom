import promClient from "prom-client";

export const createMetrics = (io, roomState, rooms) => {
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

  const metricsMiddleware = (req, res, next) => {
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
  };

  return {
    register,
    metricsMiddleware,
    updateRoomsMetric,
    updateRoleMetrics
  };
};
