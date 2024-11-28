import { Router } from "express";
import { verifyTokenMiddleware } from "../authorization/jwt";
import PaymentController from "../controller/payment";

const router: Router = Router();
const paymentController = new PaymentController();

router.post("/", verifyTokenMiddleware, paymentController.savePayments);
// 여행 결제 멤버 조회

router.put("/", verifyTokenMiddleware, paymentController.updatePayments);
router.get(
  "/:tripId",
  verifyTokenMiddleware,
  paymentController.getPaymentsByTripId
);
router.get(
  "/members/:tripId",
  verifyTokenMiddleware,
  paymentController.getGroupMembersByTripId
);

export default router;
