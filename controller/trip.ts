import { Request, Response } from "express";
import TripService from "../services/trip";
import connection from "../db";
interface DecodedToken {
  user_id: number;
  iat: number;
  exp: number;
}
interface AuthRequest extends Request {
  user?: DecodedToken;
}
class TripController {
  private tripService: TripService;
  constructor() {
    this.tripService = new TripService(connection);
  }

  public createTrip = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      const { groupId, date, days } = req.body;
      console.log(date);

      const trip = await this.tripService.createTrip(groupId, date, days);

      res.status(201).json({ message: "성공적으로 저장되었습니다", trip });
    } catch (error) {
      console.error("여행 생성 에러:", error);
      res.status(500).json({ error: "여행 생성에 실패했습니다." });
    }
  };

  public getTripDetails = async (req: AuthRequest, res: Response) => {
    try {
      const { tripId } = req.params;
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      const tripDetails = await this.tripService.getTripDetails(
        parseInt(tripId)
      );
      res.json(tripDetails);
    } catch (error) {
      console.error("여행 조회 에러:", error);
      res.status(500).json({ error: "여행 조회에 실패 했습니다." });
    }
  };
}
export default TripController;
