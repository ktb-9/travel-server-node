import { Router } from "express";
import GroupController from "../controller/group";
import { verifyTokenMiddleware } from "../authorization/jwt";

const router: Router = Router();
const groupController = new GroupController();

// 그룹 생성 및 조회
router.post("/", verifyTokenMiddleware, groupController.createGroup);
router.get("/:groupId", verifyTokenMiddleware, groupController.getGroupDetails);

// // 초대 링크 관련
// router.post(
//   "/invite/:groupId",
//   verifyTokenMiddleware,
//   groupController.createInviteLink
// );
// router.get("/join/:inviteId", verifyTokenMiddleware, groupController.joinGroup);

// 그룹 멤버 관련
router.get(
  "/:groupId/members",
  verifyTokenMiddleware,
  groupController.getGroupMembers
);

export default router;
