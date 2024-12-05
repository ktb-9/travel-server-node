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

class ImageUploader {
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

  // 위치 썸네일 업로드 미들웨어 생성
  createThumbnailUploadMiddleware(userId: number) {
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
          // 새로운 파일 이름 생성 (시간을 기준으로 고유한 이름)
          const timestamp = Date.now();
          const filename = `image/ai_image/${userId}_${timestamp}.png`;
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
}

export default ImageUploader; // 클래스 내보내기
