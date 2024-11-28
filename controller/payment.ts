import { Request, Response } from "express";
import connection from "../db";
import PaymentService from "../services/payment";
interface DecodedToken {
  user_id: number;
  iat: number;
  exp: number;
}
interface AuthRequest extends Request {
  user?: DecodedToken;
}
class PaymentController {
  private paymentService: PaymentService;
  constructor() {
    this.paymentService = new PaymentService(connection);
  }

  public getGroupMembersByTripId = async (req: AuthRequest, res: Response) => {
    try {
      const { tripId } = req.params;
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      const members = await this.paymentService.getGroupMembersByTripId(
        req.user.user_id,
        parseInt(tripId)
      );

      res.status(201).json(members);
    } catch (error) {
      console.error("결제를 위한 그룹 멤버 조회 에러:", error);
      res
        .status(500)
        .json({ error: "여행 ID로 결제를 위한 그룹 멤버 조회 실패." });
    }
  };

  public savePayments = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      await this.paymentService.savePayments(req.body);
      res.status(201).json({ message: "성공적으로 저장되었습니다." });
    } catch (error) {
      console.error("정산 저장 에러:", error);
      res.status(500).json({ error: "정산 저장에 실패." });
    }
  };
  public updatePayments = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      await this.paymentService.updatePayments(req.body);
      res.status(201).json({ message: "성공적으로 수정 되었습니다." });
    } catch (error) {
      console.error("정산 저장 에러:", error);
      res.status(500).json({ error: "정산 수정에 실패." });
    }
  };

  public getPaymentsByTripId = async (req: AuthRequest, res: Response) => {
    try {
      const { tripId } = req.params;
      console.log(tripId);
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      const payments = await this.paymentService.getPaymentsByTripId(
        parseInt(tripId)
      );

      res.status(201).json(payments);
    } catch (error) {
      console.error("결제를 위한 정산 조회 에러:", error);
      res.status(500).json({ error: "여행 ID로 결제를 위한 정산 조회 실패." });
    }
  };
}
export default PaymentController;
