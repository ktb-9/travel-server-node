import { Router } from "express";
import ImageController from "../controller/image";

const router: Router = Router();
const imageController = new ImageController();
// 카카오 로그인 URL 생성 라우트
router.post("/:userId", imageController.uploadImage);
export default router;
