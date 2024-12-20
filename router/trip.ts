import { Router } from "express";
import TripController from "../controller/trip";
import { verifyTokenMiddleware } from "../authorization/jwt";

const router: Router = Router();
const tripController = new TripController();

// 여행 생성
router.post("/", verifyTokenMiddleware, tripController.createTrip);
router.post("/location", verifyTokenMiddleware, tripController.addLocation);
router.get("/mytrip", verifyTokenMiddleware, tripController.getMyGroupTrips);
router.get(
  "/upcomming",
  verifyTokenMiddleware,
  tripController.getUpcommingGroup
);
router.post("/upload", verifyTokenMiddleware, tripController.uploadNewImage);
router.post(
  "/upload/:locationId",
  verifyTokenMiddleware,
  tripController.uploadLocationThumbnail
);
router.get(
  "/exist/:groupId",
  verifyTokenMiddleware,
  tripController.joinExistingGroup
);
// 여행 상세 조회
router.get("/:tripId", verifyTokenMiddleware, tripController.getTripDetails);
router.put(
  "/:groupId",
  verifyTokenMiddleware,
  tripController.updateTropLocation
);
router.delete(
  "/:locationId",
  verifyTokenMiddleware,
  tripController.deleteTripLocation
);

export default router;
