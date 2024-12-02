import { Request, Response } from "express";

import connection from "../db";
import GroupService from "../services/group";
import GroupThumbnailUploader from "../module/GroupThumbnailUploader";
import GroupBackgroundUploader from "../module/GroupBackgroundUploader";
interface DecodedToken {
  user_id: number;
  iat: number;
  exp: number;
}
interface AuthRequest extends Request {
  user?: DecodedToken;
}
class GroupController {
  private groupService: GroupService;
  private thumbnailUploader: GroupThumbnailUploader;
  private backgroundUploader: GroupBackgroundUploader;

  constructor() {
    this.groupService = new GroupService(connection);
    this.thumbnailUploader = new GroupThumbnailUploader(connection);
    this.backgroundUploader = new GroupBackgroundUploader(connection);
  }
  public createGroup = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      const { name } = req.body;
      const group = await this.groupService.createGroup(
        { name },
        req.user.user_id
      );

      res.status(201).json(group);
    } catch (error) {
      console.error("그룹 생성 에러:", error);
      res.status(500).json({ error: "그룹 생성에 실패했습니다." });
    }
  };

  public getGroupDetails = async (req: AuthRequest, res: Response) => {
    try {
      const { groupId } = req.params;

      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      const groupDetails = await this.groupService.getGroupDetails(
        parseInt(groupId)
      );
      res.json(groupDetails);
    } catch (error) {
      console.error("그룹 조회 에러:", error);
      res.status(500).json({ error: "그룹 조회에 실패했습니다." });
    }
  };

  public updateGroup = async (req: AuthRequest, res: Response) => {
    try {
      const { tripId } = req.params;
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      await this.groupService.updateGroup(parseInt(tripId), req.body);
      res.status(201).json({ message: "성공적으로 업데이트 했습니다." });
    } catch (error) {
      console.error("그룹 업데이트 에러:", error);
      res.status(500).json({ error: "그룹 업데이트에 실패했습니다." });
    }
  };

  public createInviteLink = async (req: AuthRequest, res: Response) => {
    try {
      const { groupId } = req.params;

      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      const inviteLink = await this.groupService.createInviteLink(
        parseInt(groupId),
        req.user.user_id
      );

      res.json({ inviteLink });
    } catch (error) {
      console.error("초대 링크 생성 에러:", error);
      res.status(500).json({ error: "초대 링크 생성에 실패했습니다." });
    }
  };

  public getGroupMembers = async (req: AuthRequest, res: Response) => {
    try {
      const { groupId } = req.params;

      if (!req.user?.user_id) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }

      const members = await this.groupService.getGroupMembers(
        parseInt(groupId)
      );
      res.json(members);
    } catch (error) {
      console.error("멤버 조회 에러:", error);
      res.status(500).json({ error: "멤버 조회에 실패했습니다." });
    }
  };

  public uploadGroupThumbnail = async (req: AuthRequest, res: Response) => {
    const { groupId } = req.params;

    if (!req.user?.user_id) {
      return res.status(401).json({ error: "인증이 필요합니다." });
    }

    const upload = await this.thumbnailUploader.createThumbnailUploadMiddleware(
      parseInt(groupId)
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
          parseInt(groupId),
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

  public uploadGroupBackground_URL = async (
    req: AuthRequest,
    res: Response
  ) => {
    const { groupId } = req.params;

    if (!req.user?.user_id) {
      return res.status(401).json({ error: "인증이 필요합니다." });
    }

    const upload =
      await this.backgroundUploader.createThumbnailUploadMiddleware(
        parseInt(groupId)
      );

    upload.single("thumbnail")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      try {
        // Multer-S3가 요청에 추가한 썸네일 URL
        const thumbnailUrl = (req.file as any).location;

        // 데이터베이스의 썸네일 URL 업데이트
        await this.backgroundUploader.updateThumbnailUrl(
          parseInt(groupId),
          thumbnailUrl
        );

        res.json({
          message: "배경 업로드 성공",
          thumbnailUrl,
        });
      } catch (error) {
        res.status(500).json({ error: "배경 업데이트 실패" });
      }
    });
  };
}
export default GroupController;
