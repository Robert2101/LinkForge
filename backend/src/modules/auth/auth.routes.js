import { Router } from "express";
import { authController } from "./auth.controller.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from "./auth.validation.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimiter } from "../../middleware/rateLimiter.js";

const router = Router();

// Strict rate limit on brute-forceable endpoints (5 requests per 15 minutes per IP)
const authLimiter = rateLimiter({
  limit: 10,
  windowSeconds: 900,
  prefix: "rl:auth",
});

router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/refresh", validate(refreshSchema), authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.getMe);

export default router;
