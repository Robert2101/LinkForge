import { Router } from "express";
import { analyticsController } from "./analytics.controller.js";
import { authenticate, optionalAuthenticate } from "../../middleware/authenticate.js";

const router = Router();

router.get("/overview", authenticate, analyticsController.getUserOverview);
router.get("/:urlId/summary", optionalAuthenticate, analyticsController.getSummary);
router.get("/:urlId/timeseries", optionalAuthenticate, analyticsController.getTimeSeries);
router.get("/:urlId/breakdown", optionalAuthenticate, analyticsController.getBreakdown);

export default router;
