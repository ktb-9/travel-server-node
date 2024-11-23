// index.ts
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import kakaoRouter from "./router/kakao";
import groupRouter from "./router/group";
import tripRouter from "./router/trip";
import { Pool, createPool } from "mysql2/promise";
import { SocketService } from "./services/SocketService";
import dbConfig from "./config/db.config";
import { CalendarSocketService } from "./services/calendarServices";
const cors = require("cors");
const { swaggerUi, specs } = require("./module/swagger");
require("dotenv").config();

const app = express();
const httpServer = createServer(app);

// DB 연결 설정
const pool = createPool({
  host: dbConfig.HOST,
  user: dbConfig.USER,
  password: dbConfig.PASSWORD,
  database: dbConfig.DB,
  port: dbConfig.PORT,
});

// CORS 설정
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },
});

app.use(express.json());
app.set("port", process.env.PORT || 8000);

app.use("/auth", kakaoRouter);
app.use("/group", groupRouter);
app.use("/trip", tripRouter);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Socket.IO 서비스 초기화
const socketService = new SocketService(io, pool);
const calendarSocketService = new CalendarSocketService(io, pool);
calendarSocketService.initialize();
socketService.initialize();

httpServer.listen(app.get("port"), () => {
  console.log(app.get("port"), "번에서 대기중");
});

export { io };
