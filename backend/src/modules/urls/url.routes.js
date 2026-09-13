import { Router } from "express";
import { urlController } from "./url.controller.js";
import {
  createUrlSchema,
  updateUrlSchema,
  urlIdParamSchema,
  listUrlsQuerySchema,
} from "./url.validation.js";
import { validate } from "../../middleware/validate.js";
import { authenticate, optionalAuthenticate } from "../../middleware/authenticate.js";
import { rateLimiter } from "../../middleware/rateLimiter.js";

const router = Router();

// Rate limiter for URL creation: 30 URLs per 15 minutes per IP
const createUrlLimiter = rateLimiter({
  limit: 30,
  windowSeconds: 900,
  prefix: "rl:create-url",
  keyGenerator: (req) => req.user?.id || req.ip,
});

router.post(
  "/",
  optionalAuthenticate,
  createUrlLimiter,
  validate(createUrlSchema),
  urlController.create
);

router.get(
  "/",
  authenticate,
  validate(listUrlsQuerySchema),
  urlController.list
);

router.get(
  "/:id",
  optionalAuthenticate,
  validate(urlIdParamSchema),
  urlController.getById
);

router.patch(
  "/:id",
  authenticate,
  validate(updateUrlSchema),
  urlController.update
);

router.delete(
  "/:id",
  authenticate,
  validate(urlIdParamSchema),
  urlController.delete
);

router.get(
  "/:id/qr",
  validate(urlIdParamSchema),
  urlController.getQrCode
);

export default router;
