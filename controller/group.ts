import { Request, Response } from "express";

import connection from "../db";
import GroupService from "../services/group";
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

  constructor() {
    this.groupService = new GroupService(connection);
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
}
export default GroupController;
