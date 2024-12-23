import { Pool, RowDataPacket } from "mysql2/promise";
import jwt, { JwtPayload } from "jsonwebtoken";
import { generateToken, generateRefreshToken } from "../authorization/jwt";

interface AppleJwtPayload extends JwtPayload {
  email?: string;
  sub: string;
}

class AppleService {
  private db: Pool;
  private readonly APPLE_CLIENT_ID: string = process.env.APPLE_CLIENT_ID!;
  private readonly APPLE_TEAM_ID: string = process.env.APPLE_TEAM_ID!;
  private readonly APPLE_KEY_ID: string = process.env.APPLE_KEY_ID!;
  private readonly APPLE_PRIVATE_KEY: string = process.env.APPLE_PRIVATE_KEY!;

  constructor(db: Pool) {
    this.db = db;
  }

  private async generateClientSecret(): Promise<string> {
    const token = jwt.sign(
      {
        iss: this.APPLE_TEAM_ID,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 180, // 180일
        aud: "https://appleid.apple.com",
        sub: this.APPLE_CLIENT_ID,
      },
      this.APPLE_PRIVATE_KEY,
      {
        algorithm: "ES256",
        header: {
          kid: this.APPLE_KEY_ID,
          typ: "JWT",
          alg: "ES256",
        },
      }
    );

    return token;
  }

  public async verifyAppleToken(identityToken: string) {
    try {
      const decodedToken = jwt.decode(identityToken, { complete: true });

      if (!decodedToken || typeof decodedToken.payload === "string") {
        throw new Error("Invalid Apple token");
      }

      const payload = decodedToken.payload as AppleJwtPayload;
      const appleUserId = payload.sub;
      const email = payload.email;

      if (!appleUserId) {
        throw new Error("Invalid Apple token");
      }

      // DB에서 사용자 찾기 또는 생성
      const user = await this.findOrCreateUser({
        userId: appleUserId,
        email: email,
      });

      // JWT 토큰 생성 (숫자로 변환된 user_id 사용)
      const tokens = this.generateUserTokens(user.user_id.toString());

      return {
        user: {
          id: user.user_id,
          nickname: user.nickname,
          profileImage: user.profileImage,
        },
        tokens,
      };
    } catch (error) {
      console.error("Apple token verification error:", error);
      throw error;
    }
  }

  private async findOrCreateUser(appleUser: {
    userId: string;
    email?: string;
  }): Promise<RowDataPacket> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();

      // 기존 사용자 찾기
      const [existingUsers] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM user_tb WHERE apple_id = ?",
        [appleUser.userId]
      );

      if (existingUsers.length > 0) {
        await connection.commit();
        return existingUsers[0];
      }

      // 새 사용자 생성
      const [result] = await connection.query(
        "INSERT INTO user_tb (nickname, email, login_type, apple_id) VALUES (?, ?, ?, ?)",
        [
          `User${Math.random().toString(36).substr(2, 6)}`,
          appleUser.email || null,
          "apple",
          appleUser.userId,
        ]
      );

      const [newUser] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM user_tb WHERE user_id = ?",
        [(result as any).insertId]
      );

      await connection.commit();
      return newUser[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private generateUserTokens(userId: string) {
    return {
      accessToken: generateToken({ user_id: userId }),
      refreshToken: generateRefreshToken({ user_id: userId }),
    };
  }
}

export default AppleService;
