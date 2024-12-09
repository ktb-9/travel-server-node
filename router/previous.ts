import { Router } from "express";
import GroupController from "../controller/group";
import { verifyTokenMiddleware } from "../authorization/jwt";

const router: Router = Router();
const groupController = new GroupController();

router.get("/", verifyTokenMiddleware, groupController.getPreviousGroup);

export default router;
