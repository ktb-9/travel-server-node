// routes/auth.ts
import { Router } from "express";
import AppleController from "../controller/apple";

const router: Router = Router();
const appleController = new AppleController(); // Corrected variable name and controller type

router.post("/callback", appleController.handleAppleCallback);
export default router;
