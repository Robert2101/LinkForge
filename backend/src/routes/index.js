import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import urlRoutes from "../modules/urls/url.routes.js";
import analyticsRoutes from "../modules/analytics/analytics.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/urls", urlRoutes);
router.use("/analytics", analyticsRoutes);

export default router;
