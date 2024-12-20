import { Request, Response } from "express";
import connection from "../db";
import DeleteService from "../services/DeleteServices";

interface DecodedToken {
  user_id: number;
  iat: number;
  exp: number;
}

interface AuthRequest extends Request {
  user?: DecodedToken;
}

class DeleteController {
  private deleteService: DeleteService;

  constructor() {
    this.deleteService = new DeleteService(connection);
  }

  public leaveGroupByTripId = async (req: AuthRequest, res: Response) => {
    try {
      const { tripId } = req.params;
      console.log("삭제", tripId);

      // 인증 확인
      if (!req.user?.user_id) {
        return res.status(401).json({
          success: false,
          message: "인증이 필요합니다.",
        });
      }

      // tripId 유효성 검사
      if (!tripId || typeof tripId !== "string") {
        return res.status(400).json({
          success: false,
          message: "올바른 여행 ID를 입력해주세요.",
        });
      }

      const parsedTripId = parseInt(tripId);
      if (isNaN(parsedTripId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 여행 ID 형식이 아닙니다.",
        });
      }

      // 그룹 탈퇴 처리
      await this.deleteService.leaveGroupByTripId(
        parsedTripId,
        req.user.user_id
      );

      return res.status(200).json({
        success: true,
        message: "그룹 탈퇴가 완료되었습니다.",
      });
    } catch (error: any) {
      console.error("그룹 탈퇴 처리 중 에러 발생:", error);

      // 특정 에러 메시지에 따른 처리
      if (error.message === "존재하지 않는 여행입니다.") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      if (error.message === "해당 그룹의 멤버가 아닙니다.") {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      // 기타 서버 에러
      return res.status(500).json({
        success: false,
        message: "그룹 탈퇴 처리 중 오류가 발생했습니다.",
      });
    }
  };
}

export default DeleteController;
