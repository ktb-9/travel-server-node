import { Router } from "express";
import { verifyTokenMiddleware } from "../authorization/jwt";
import ExpenseAnalysisController from "../controller/ExpenseAnalysis";

const router: Router = Router();
const expenseAnalysisController = new ExpenseAnalysisController();

router.get(
  "/:tripId",
  verifyTokenMiddleware,
  expenseAnalysisController.getExpenseAnalysis
);

export default router;
