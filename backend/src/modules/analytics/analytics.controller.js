import { analyticsService } from "./analytics.service.js";

export const analyticsController = {
  async getSummary(req, res, next) {
    try {
      const result = await analyticsService.getSummary(
        req.params.urlId,
        req.user?.id
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getTimeSeries(req, res, next) {
    try {
      const days = req.query.days ? parseInt(req.query.days, 10) : 14;
      const result = await analyticsService.getTimeSeries(
        req.params.urlId,
        req.user?.id,
        days
      );
      res.status(200).json({ timeseries: result });
    } catch (error) {
      next(error);
    }
  },

  async getBreakdown(req, res, next) {
    try {
      const result = await analyticsService.getBreakdown(
        req.params.urlId,
        req.user?.id
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getUserOverview(req, res, next) {
    try {
      const result = await analyticsService.getUserDashboardOverview(
        req.user.id
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
};
