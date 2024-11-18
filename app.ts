import express from "express";
const cors = require("cors");
const app = express();
const { swaggerUi, specs } = require("./module/swagger");
app.use(express.json()); // JSON 바디 파서 추가
app.use(cors());
app.set("port", process.env.PORT || 8000);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
app.listen(app.get("port"), () => {
  console.log(app.get("port"), "번에서 대기중");
});
