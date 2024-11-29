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

class GroupThumbnailUploader {
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
      const [existingGroupThumbnail] = await this.db.query<RowDataPacket[]>(
        "SELECT group_thumbnail FROM group_tb WHERE group_id = ?",
        [groupId]
      );

      if (
        existingGroupThumbnail.length > 0 &&
        existingGroupThumbnail[0].group_thumbnail
      ) {
        // 기존 썸네일 URL에서 파일명을 추출
        const thumbnailUrl = existingGroupThumbnail[0].group_thumbnail;
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

          console.log(`기존 썸네일 삭제: ${filename}`);
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
          const filename = `image/group_thumbnail/${groupId}_${timestamp}.png`;
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

  // 데이터베이스에 썸네일 URL 업데이트
  async updateThumbnailUrl(
    groupId: number,
    thumbnailUrl: string
  ): Promise<void> {
    const connection = await this.db.getConnection(); // 데이터베이스 커넥션 가져오기
    try {
      await connection.beginTransaction(); // 트랜잭션 시작
      console.log(thumbnailUrl);

      // 썸네일 URL 업데이트 쿼리 실행
      await connection.query(
        "UPDATE group_tb SET group_thumbnail = ? WHERE group_id = ?",
        [thumbnailUrl, groupId]
      );

      await connection.commit(); // 트랜잭션 커밋
    } catch (error) {
      console.log(error);
      await connection.rollback(); // 에러 발생 시 트랜잭션 롤백
      throw error; // 에러 재발생
    } finally {
      connection.release(); // 커넥션 반환
    }
  }
}

export default GroupThumbnailUploader; // 클래스 내보내기
