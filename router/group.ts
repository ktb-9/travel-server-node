import { Router } from "express";
import GroupController from "../controller/group";
import { verifyTokenMiddleware } from "../authorization/jwt";

const router: Router = Router();
const groupController = new GroupController();

// 그룹 생성 및 조회
router.post("/", verifyTokenMiddleware, groupController.createGroup);
router.get("/:groupId", verifyTokenMiddleware, groupController.getGroupDetails);
router.put("/:tripId", verifyTokenMiddleware, groupController.updateGroup);
// 그룹 썸네일 업로드
router.post(
  "/upload/:groupId",
  verifyTokenMiddleware,
  groupController.uploadGroupThumbnail
);
// 그룹 배경 이미지 업로드 및 조회
router.post(
  "/background/upload/:groupId",
  verifyTokenMiddleware,
  groupController.uploadGroupBackground_URL
);

// 초대 링크 생성
router.post(
  "/invite/:groupId",
  verifyTokenMiddleware,
  groupController.createInviteLink
);

// 그룹 멤버 조회
router.get(
  "/:groupId/members",
  verifyTokenMiddleware,
  groupController.getGroupMembers
);

export default router;
