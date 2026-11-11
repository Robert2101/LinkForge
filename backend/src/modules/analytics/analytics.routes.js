import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { linkIdParams } from "../urls/url.validation.js";
import { analyticsService } from "./analytics.service.js";

// /api/v1/analytics — every route here requires a signed-in user and only
// ever returns data about that user's own links.
const router = Router();
router.use(requireAuth);

const rangeQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

router.get("/overview", validate({ query: rangeQuery }), async (req, res) => {
  res.json(await analyticsService.getOverview(req.user.id, req.valid.query.days));
});

router.get("/links/:id", validate({ params: linkIdParams, query: rangeQuery }), async (req, res) => {
  res.json(
    await analyticsService.getLinkAnalytics(req.valid.params.id, req.user.id, req.valid.query.days)
  );
});

export default router;
