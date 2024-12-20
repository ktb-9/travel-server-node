import { Router } from "express";
import { verifyTokenMiddleware } from "../authorization/jwt";
import DeleteController from "../controller/delete";

const router: Router = Router();
const deleteController = new DeleteController();

router.delete(
  "/leave/:tripId",
  verifyTokenMiddleware,
  deleteController.leaveGroupByTripId
);

export default router;
