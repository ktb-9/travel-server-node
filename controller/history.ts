import { Request, Response } from "express";
import connection from "../db";
import HistoryService from "../services/history";
interface DecodedToken {
  user_id: number;
  iat: number;
  exp: number;
}
interface AuthRequest extends Request {
  user?: DecodedToken;
}
class HistoryController {
  private historyService: HistoryService;
  constructor() {
    this.historyService = new HistoryService(connection);
  }

  public getHistory = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      const history = await this.historyService.getHistory(req.user.user_id);

      res.status(201).json(history);
    } catch (error) {
      console.error("여행 종료된 히스토리 조회 에러:", error);
      res.status(500).json({ error: "여행 종료된 히스토리 조회 실패." });
    }
  };
}
export default HistoryController;
