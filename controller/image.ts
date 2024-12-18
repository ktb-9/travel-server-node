import { Request, Response } from "express";

import connection from "../db";
import ImageUploader from "../module/ImageUploader";
interface DecodedToken {
  user_id: number;
  iat: number;
  exp: number;
}
interface AuthRequest extends Request {
  user?: DecodedToken;
}
class ImageController {
  private imageUploader: ImageUploader;
  constructor() {
    this.imageUploader = new ImageUploader(connection);
  }

  public uploadImage = async (req: AuthRequest, res: Response) => {
    const { userId } = req.params;

    const upload = await this.imageUploader.createThumbnailUploadMiddleware(
      parseInt(userId)
    );

    upload.single("thumbnail")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      try {
        // Multer-S3가 요청에 추가한 썸네일 URL
        const thumbnailUrl = (req.file as any).location;

        res.json({
          message: "썸네일 업로드 성공",
          thumbnailUrl,
        });
      } catch (error) {
        res.status(500).json({ error: "썸네일 업데이트 실패" });
      }
    });
  };
}
export default ImageController;
