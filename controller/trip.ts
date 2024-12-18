import { Request, Response } from "express";
import TripService from "../services/trip";
import connection from "../db";
import TripLocationThumbnailUploader from "../module/TripLocationThumbnailUploader";
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
  private thumbnailUploader: TripLocationThumbnailUploader;
  constructor() {
    this.tripService = new TripService(connection);
    this.thumbnailUploader = new TripLocationThumbnailUploader(connection);
  }

  public createTrip = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      const { groupId, groupName, groupThumbnail, date } = req.body;
      console.log(date);

      const trip = await this.tripService.createTrip(
        groupId,
        groupName,
        groupThumbnail,
        date
      );

      res.status(201).json({ message: "성공적으로 저장되었습니다", trip });
    } catch (error) {
      console.error("여행 생성 에러:", error);
      res.status(500).json({ error: "여행 생성에 실패했습니다." });
    }
  };
  public addLocation = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      await this.tripService.addLocation(req.body);
      res.status(201).json({ message: "성공적으로 저장되었습니다" });
    } catch (error) {
      console.error("여행 장소 추가 에러:", error);
      res.status(500).json({ error: "여행 장소 추가에 실패했습니다." });
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

  public getMyGroupTrips = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      const myGroupTrip = await this.tripService.getUserTrips(req.user.user_id);
      res.json(myGroupTrip);
    } catch (error) {
      console.error("나의 여행 그룹 조회 에러", error);
      res.status(500).json({ error: "나의 여행 그룹 조회에 실패 했습니다." });
    }
  };
  public updateTropLocation = async (req: AuthRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      await this.tripService.updateTripLocation(
        req.user.user_id,
        parseInt(groupId),
        req.body
      );
      res.json({ message: "성공적으로 수정 했습니다." });
    } catch (error) {
      console.error("여행 장소 수정 에러", error);
      res.status(500).json({ error: "여행 장소 수정에 실패 했습니다." });
    }
  };

  public deleteTripLocation = async (req: AuthRequest, res: Response) => {
    try {
      const { locationId } = req.params;
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      await this.tripService.deleteTripLocation(parseInt(locationId));
      res.json({ message: "성공적으로 삭제 했습니다." });
    } catch (error) {
      console.error("여행 장소 삭제 에러", error);
      res.status(500).json({ error: "여행 장소 삭제에 실패 했습니다." });
    }
  };

  public uploadLocationThumbnail = async (req: AuthRequest, res: Response) => {
    const { locationId } = req.params;

    if (!req.user?.user_id) {
      return res.status(401).json({ error: "인증이 필요합니다." });
    }

    const upload = await this.thumbnailUploader.createThumbnailUploadMiddleware(
      parseInt(locationId)
    );

    upload.single("thumbnail")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      try {
        // Multer-S3가 요청에 추가한 썸네일 URL
        const thumbnailUrl = (req.file as any).location;

        // 데이터베이스의 썸네일 URL 업데이트
        await this.thumbnailUploader.updateThumbnailUrl(
          parseInt(locationId),
          thumbnailUrl
        );

        res.json({
          message: "썸네일 업로드 성공",
          thumbnailUrl,
        });
      } catch (error) {
        res.status(500).json({ error: "썸네일 업데이트 실패" });
      }
    });
  };
  public getUpcommingGroup = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      const UpcommingTrip = await this.tripService.getUpcomingTrip(
        req.user.user_id
      );
      res.status(201).json(UpcommingTrip);
    } catch (error) {
      console.error("다가오는 일정 조회 오류:", error);
      res.status(500).json({ error: "다가오는 일정 조회에 실패했습니다." });
    }
  };
}
export default TripController;
