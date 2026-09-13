import { urlService } from "./url.service.js";

export const urlController = {
  async create(req, res, next) {
    try {
      const result = await urlService.createUrl({
        userId: req.user?.id || null,
        ...req.body,
      });
      res.status(201).json({
        message: "Short URL created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async list(req, res, next) {
    try {
      const result = await urlService.listUserUrls(req.user.id, req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const result = await urlService.getUrlById(req.params.id, req.user?.id);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const result = await urlService.updateUrl(
        req.params.id,
        req.user.id,
        req.body
      );
      res.status(200).json({
        message: "URL updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      await urlService.deleteUrl(req.params.id, req.user.id);
      res.status(200).json({ message: "URL deleted successfully" });
    } catch (error) {
      next(error);
    }
  },

  async getQrCode(req, res, next) {
    try {
      const format = req.query.format === "svg" ? "svg" : "png";
      const result = await urlService.generateQrCode(req.params.id, format);

      if (format === "svg") {
        res.setHeader("Content-Type", "image/svg+xml");
        return res.send(result.data);
      }

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
};
