import { Request, Response } from "express";

import { Pool } from "mysql2/promise";
import AppleService from "../services/apple";
import connection from "../db";

class AppleController {
  private appleService: AppleService;

  constructor() {
    this.appleService = new AppleService(connection);
  }

  public handleAppleCallback = async (req: Request, res: Response) => {
    try {
      const { identityToken } = req.body;

      if (!identityToken) {
        return res.status(400).json({ message: "Identity token is required" });
      }

      const result = await this.appleService.verifyAppleToken(identityToken);

      res.status(200).json(result);
    } catch (error) {
      console.error("Apple callback error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  };
}

export default AppleController;
