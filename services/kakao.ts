import { Pool, RowDataPacket } from "mysql2/promise";
import axios from "axios";
import { generateToken, generateRefreshToken } from "../authorization/jwt";
class KakaoService {
  private db: Pool;
  private readonly KAKAO_CLIENT_ID: string = process.env.KAKAO_CLIENT_ID!;
  private readonly KAKAO_CLIENT_SECRET: string =
    process.env.KAKAO_CLIENT_SECRET!;
  private readonly REDIRECT_URI: string = process.env.REDIRECT_URI!;

  constructor(db: Pool) {
    this.db = db;
  }
  public getKakaoAuthURL(redirectUri?: string): string {
    return `https://kauth.kakao.com/oauth/authorize?client_id=${
      this.KAKAO_CLIENT_ID
    }&redirect_uri=${redirectUri || this.REDIRECT_URI}&response_type=code`;
  }
  public async processKakaoCallback(code: string) {
    try {
      // 1. 카카오 액세스 토큰 얻기
      const kakaoToken = await this.getKakaoToken(code);

      // 2. 카카오 사용자 정보 얻기
      const kakaoUser = await this.getKakaoUserInfo(kakaoToken);

      // 3. DB에서 사용자 찾기 또는 생성
      const user = await this.findOrCreateUser(kakaoUser);

      // 4. JWT 토큰 생성
      const tokens = this.generateUserTokens(kakaoUser.userId);
      return {
        user: {
          id: user.id,
          nickname: user.nickname,
          profileImage: user.profileImage,
        },
        tokens,
      };
    } catch (error) {
      console.error("카카오 콜백 에러 처리:", error);
      throw error;
    }
  }

  private async getKakaoToken(code: string): Promise<string> {
    try {
      const response = await axios.post(
        "https://kauth.kakao.com/oauth/token",
        null,
        {
          params: {
            grant_type: "authorization_code",
            client_id: this.KAKAO_CLIENT_ID,
            client_secret: this.KAKAO_CLIENT_SECRET,
            redirect_uri: this.REDIRECT_URI,
            code: code,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      return response.data.access_token;
    } catch (error) {
      console.error("카카오 토큰 발급시 오류:", error);
      throw new Error("카카오 토큰 발급 실패");
    }
  }

  private async getKakaoUserInfo(accessToken: string): Promise<KakaoUser> {
    try {
      const response = await axios.get("https://kapi.kakao.com/v2/user/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const { id, properties, kakao_account } = response.data;
      return {
        userId: id,
        nickname: properties.nickname || kakao_account?.profile?.nickname,
        profileImage:
          properties.profile_image || kakao_account?.profile?.profile_image_url,
      };
    } catch (error) {
      console.error("카카오 유정 정보 가져오기 오류:", error);
      throw new Error("카카오 유저 정보 가져오기 실패");
    }
  }

  private async findOrCreateUser(kakaoUser: KakaoUser): Promise<RowDataPacket> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();

      // 기존 사용자 찾기
      const [existingUsers] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM user_tb WHERE id = ?",
        [kakaoUser.userId]
      );

      if (existingUsers.length > 0) {
        await connection.commit();
        return existingUsers[0];
      }

      // 새 사용자 생성
      const [result] = await connection.query(
        "INSERT INTO user_tb (id, nickname,  profileImage) VALUES (?, ?, ?)",
        [kakaoUser.userId, kakaoUser.nickname, kakaoUser.profileImage]
      );

      const [newUser] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM user_tb WHERE user_id = ?",
        [(result as any).insertId]
      );

      await connection.commit();
      return newUser[0];
    } catch (error) {
      await connection.rollback();
      console.error("데이터베이스 에러:", error);
      throw new Error("유저 데이터 처리 과정 실패");
    } finally {
      connection.release();
    }
  }

  private generateUserTokens(kakaoId: string) {
    return {
      accessToken: generateToken({ id: kakaoId }),
      refreshToken: generateRefreshToken({
        id: kakaoId,
      }),
    };
  }
  public async getUserProfile(userId: number) {
    try {
      const [users] = await this.db.query<RowDataPacket[]>(
        "SELECT id, nickname,  profileImage FROM user_tb WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        throw new Error("회원 없음");
      }

      return users[0];
    } catch (error) {
      console.error("프로필 조회 오류", error);
      throw new Error("프로필 조회 실패");
    }
  }
}
export default KakaoService;
