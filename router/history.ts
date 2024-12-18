import { Router } from "express";
import { verifyTokenMiddleware } from "../authorization/jwt";
import HistoryController from "../controller/history";

const router: Router = Router();
const historyController = new HistoryController();

router.get("/", verifyTokenMiddleware, historyController.getHistory);

export default router;
