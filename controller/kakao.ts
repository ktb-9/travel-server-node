import { Request, Response } from "express";
import KakaoService from "../services/kakao";
import connection from "../db";
import { generateToken, verifyRefreshToken } from "../authorization/jwt";
interface DecodedToken {
  user_id: number;
  iat: number;
  exp: number;
}
interface AuthRequest extends Request {
  user?: DecodedToken;
}
class KakaoController {
  private kakaoService: KakaoService;

  constructor() {
    this.kakaoService = new KakaoService(connection);
  }

  public redirectToKakaoLogin = (req: Request, res: Response) => {
    try {
      const { redirectUri } = req.query;
      const kakaoAuthURL = this.kakaoService.getKakaoAuthURL(
        redirectUri as string
      );
      res.redirect(kakaoAuthURL);
    } catch (error) {
      console.error("Failed to generate Kakao login URL:", error);
      res.status(500).json({ error: "Failed to generate Kakao login URL" });
    }
  };

  public handleKakaoCallback = async (req: Request, res: Response) => {
    console.log(req);
    try {
      const { code } = req.query;
      if (!code || typeof code !== "string") {
        return res
          .status(400)
          .json({ error: "Authorization code is required" });
      }

      const result = await this.kakaoService.processKakaoCallback(code);
      res.json(result);
    } catch (error) {
      console.error("Kakao callback error:", error);
      res.status(500).json({ error: "Failed to process Kakao login" });
    }
  };

  public getProfile = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const profile = await this.kakaoService.getUserProfile(req.user.user_id);
      res.json(profile);
    } catch (error) {
      console.error("Profile fetch error:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  };

  public async refreshToken(req: Request, res: Response): Promise<any> {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(403).json({
        message: "리프레쉬 토큰이 없습니다.",
        code: "REFRESH_TOKEN_MISSING",
      });
    }

    try {
      // refreshToken에서 user_id 추출
      const decoded = verifyRefreshToken(refreshToken);
      const userId = decoded?.user_id; // refreshToken에서 user_id 가져오기

      // 새로운 액세스 토큰 발급
      const accessToken = generateToken({ user_id: userId });
      return res.json({ accessToken });
    } catch (error) {
      console.error("Token verification failed:", error);
      return res.status(403).json({
        message: "리프레쉬 토큰 검증 실패",
        code: "TOKEN_VERIFICATION_FAILED",
      });
    }
  }
}

export default KakaoController;
