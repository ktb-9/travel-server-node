import { Request, Response } from "express";
import connection from "../db";
import ExpenseAnalysisService from "../services/ExpenseAnalysis";

interface DecodedToken {
  user_id: number;
  iat: number;
  exp: number;
}

interface AuthRequest extends Request {
  user?: DecodedToken;
}

class ExpenseAnalysisController {
  private expenseAnalysisService: ExpenseAnalysisService;

  constructor() {
    this.expenseAnalysisService = new ExpenseAnalysisService(connection);
  }

  public getExpenseAnalysis = async (req: AuthRequest, res: Response) => {
    try {
      const { tripId } = req.params;

      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      if (!tripId || isNaN(parseInt(tripId))) {
        return res.status(400).json({ error: "올바른 여행 ID가 필요합니다." });
      }

      const analysis = await this.expenseAnalysisService.analyzeExpenses(
        parseInt(tripId)
      );

      res.status(200).json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      console.error("지출 분석 조회 에러:", error);
      res.status(500).json({
        success: false,
        error: "지출 분석 처리 중 오류가 발생했습니다.",
      });
    }
  };
}

export default ExpenseAnalysisController;
