import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Pool, RowDataPacket } from "mysql2/promise";
import multer from "multer";
import multerS3 from "multer-s3";
import { Request } from "express";
import dotenv from "dotenv";

dotenv.config(); // .env 파일을 로드하여 환경 변수를 설정

// 썸네일 업로드 설정을 위한 인터페이스
interface ThumbnailUploadConfig {
  bucket: string; // S3 버킷 이름
  region: string; // S3 리전
}

class GroupBackgroundUploader {
  private s3: S3Client; // S3 클라이언트 인스턴스
  private db: Pool; // 데이터베이스 연결 풀
  private config: ThumbnailUploadConfig; // 설정 객체

  constructor(
    db: Pool,
    config: ThumbnailUploadConfig = {
      bucket: "assetkungya", // 기본 버킷 이름
      region: "ap-northeast-2", // 기본 리전
    }
  ) {
    this.db = db;
    this.config = config;
    this.s3 = new S3Client({
      region: config.region, // S3 클라이언트 리전 설정
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY || "", // AWS 액세스 키
        secretAccessKey: process.env.AWS_SECRETE_ACCESS_KEY || "", // AWS 비밀 키
      },
    });
  }

  // 파일이 S3에 존재하는지 확인 후 삭제
  private async deleteExistingThumbnail(groupId: number): Promise<void> {
    try {
      // 데이터베이스에서 groupId에 해당하는 썸네일 조회
      const [existingGroupBackround_URL] = await this.db.query<RowDataPacket[]>(
        "SELECT background_url FROM group_background_tb WHERE group_id = ?",
        [groupId]
      );

      if (
        existingGroupBackround_URL.length > 0 &&
        existingGroupBackround_URL[0].background_url
      ) {
        // 기존 썸네일 URL에서 파일명을 추출
        const thumbnailUrl = existingGroupBackround_URL[0].background_url;
        const filename = thumbnailUrl.split("com/")[1];

        // 파일이 S3에 존재하는지 확인
        try {
          await this.s3.send(
            new HeadObjectCommand({
              Bucket: this.config.bucket,
              Key: filename,
            })
          );

          // 파일이 존재하는 경우 삭제
          await this.s3.send(
            new DeleteObjectCommand({
              Bucket: this.config.bucket,
              Key: filename,
            })
          );

          console.log(`기존 배경 삭제: ${filename}`);
        } catch (headError: any) {
          if (headError.name === "NotFound") {
            console.log(
              `파일이 존재하지 않아 삭제하지 않았습니다: ${filename}`
            );
          } else {
            throw headError;
          }
        }
      }
    } catch (error) {
      console.error("기존 썸네일 삭제 중 오류:", error);
    }
  }

  // 위치 썸네일 업로드 미들웨어 생성
  createThumbnailUploadMiddleware(groupId: number) {
    return multer({
      storage: multerS3({
        s3: this.s3, // S3 클라이언트 설정
        bucket: this.config.bucket, // 버킷 이름
        contentType: multerS3.AUTO_CONTENT_TYPE, // 자동 콘텐츠 타입 설정
        key: async (
          req: Request,
          file: Express.Multer.File,
          cb: (error: Error | null, key?: string) => void
        ) => {
          // 기존 썸네일 삭제
          await this.deleteExistingThumbnail(groupId);

          // 새로운 파일 이름 생성 (시간을 기준으로 고유한 이름)
          const timestamp = Date.now();
          const filename = `image/group_background_url/${groupId}_${timestamp}.png`;
          cb(null, filename);
        },
        cacheControl: "no-store", // 캐시 제어 설정
      }),
      fileFilter: (req, file, cb) => {
        // 파일 유형 검증 (이미지만 허용)
        if (file.mimetype.startsWith("image/")) {
          cb(null, true);
        } else {
          cb(new Error("잘못된 파일 유형입니다. 이미지만 허용됩니다."));
        }
      },
    });
  }

  // 데이터베이스에 배경 URL 업데이트
  async updateThumbnailUrl(
    groupId: number,
    thumbnailUrl: string
  ): Promise<void> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();

      // 해당 그룹의 배경화면 URL 존재 여부 확인
      const [existingBackground] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM group_background_tb WHERE group_id = ?",
        [groupId]
      );

      // 존재하지 않으면 INSERT, 존재하면 UPDATE
      if (existingBackground[0].count === 0) {
        await connection.query(
          "INSERT INTO group_background_tb (group_id, background_url) VALUES (?, ?)",
          [groupId, thumbnailUrl]
        );
      } else {
        await connection.query(
          "UPDATE group_background_tb SET background_url = ? WHERE group_id = ?",
          [thumbnailUrl, groupId]
        );
      }

      await connection.commit();
    } catch (error) {
      console.log(error);
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default GroupBackgroundUploader; // 클래스 내보내기
