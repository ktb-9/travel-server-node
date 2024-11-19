import express from "express";
import kakaoRouter from "./router/kakao";
import groupRouter from "./router/group";
const cors = require("cors");
const app = express();
const { swaggerUi, specs } = require("./module/swagger");

require("dotenv").config();
app.use(express.json()); // JSON 바디 파서 추가
app.use(cors());
app.set("port", process.env.PORT || 8000);

app.use("/auth", kakaoRouter);
app.use("/group", groupRouter);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
app.listen(app.get("port"), () => {
  console.log(app.get("port"), "번에서 대기중");
});
