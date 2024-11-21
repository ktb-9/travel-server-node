import { Router } from "express";
import TripController from "../controller/trip";
import { verifyTokenMiddleware } from "../authorization/jwt";

const router: Router = Router();
const tripController = new TripController();

// 여행 생성
router.post("/", verifyTokenMiddleware, tripController.createTrip);

// 여행 상세 조회
router.get("/:tripId", verifyTokenMiddleware, tripController.getTripDetails);

export default router;
