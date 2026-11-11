import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import { SHORT_CODE_PATTERN } from "./shortCode.js";
import { urlService } from "./url.service.js";
import { createLinkBody, linkIdParams, listLinksQuery, qrQuery, updateLinkBody } from "./url.validation.js";
import { notFound } from "../../lib/errors.js";

// /api/v1/urls
export const urlRouter = Router();

// Creating links is the action most open to abuse (spam, phishing campaigns).
const createLimit = rateLimit({ name: "create-link", limit: 30, windowSeconds: 15 * 60 });

// Works with or without an account. Links made while signed in belong to that user.
urlRouter.post("/", optionalAuth, createLimit, validate({ body: createLinkBody }), async (req, res) => {
  const link = await urlService.createLink({ userId: req.user?.id, ...req.valid.body });
  res.status(201).json({ link });
});

urlRouter.get("/", requireAuth, validate({ query: listLinksQuery }), async (req, res) => {
  res.json(await urlService.listLinks(req.user.id, req.valid.query));
});

urlRouter.get("/:id", requireAuth, validate({ params: linkIdParams }), async (req, res) => {
  res.json({ link: await urlService.getLink(req.valid.params.id, req.user.id) });
});

urlRouter.patch(
  "/:id",
  requireAuth,
  validate({ params: linkIdParams, body: updateLinkBody }),
  async (req, res) => {
    res.json({ link: await urlService.updateLink(req.valid.params.id, req.user.id, req.valid.body) });
  }
);

urlRouter.delete("/:id", requireAuth, validate({ params: linkIdParams }), async (req, res) => {
  await urlService.deleteLink(req.valid.params.id, req.user.id);
  res.status(204).end();
});

// /api/v1/qr/:code  — a QR image for a short link. Public, like the link itself.
export const qrRouter = Router();

const qrLimit = rateLimit({ name: "qr", limit: 60, windowSeconds: 60 });

qrRouter.get("/:code", qrLimit, validate({ query: qrQuery }), async (req, res) => {
  const { code } = req.params;
  if (!SHORT_CODE_PATTERN.test(code)) throw notFound("Link not found");

  const image = await urlService.renderQrCode(code, req.valid.query.format);
  res
    .set({
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=86400", // the image for a code never changes
      "Content-Disposition": `inline; filename="linkforge-${code}.${req.valid.query.format}"`,
    })
    .send(image.body);
});
