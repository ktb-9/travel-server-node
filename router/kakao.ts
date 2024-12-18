import { Router } from "express";
import KakaoController from "../controller/kakao";
import { verifyTokenMiddleware } from "../authorization/jwt";

const router: Router = Router();
const kakaoController = new KakaoController();
// 카카오 로그인 URL 생성 라우트
router.get("/kakao/login", kakaoController.redirectToKakaoLogin);
router.get("/oauth/kakao/callback", kakaoController.handleKakaoCallback);
router.get("/profile", verifyTokenMiddleware, kakaoController.getProfile);
router.post("/refresh", kakaoController.refreshToken);
export default router;
