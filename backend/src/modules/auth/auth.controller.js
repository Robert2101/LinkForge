import { authService } from "./auth.service.js";
import { env } from "../../config/env.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const authController = {
  async register(req, res, next) {
    try {
      const { user, accessToken, refreshToken } = await authService.register(
        req.body
      );

      res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);
      res.status(201).json({
        message: "User registered successfully",
        user,
        accessToken,
      });
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const { user, accessToken, refreshToken } = await authService.login(
        req.body
      );

      res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);
      res.status(200).json({
        message: "Logged in successfully",
        user,
        accessToken,
      });
    } catch (error) {
      next(error);
    }
  },

  async refresh(req, res, next) {
    try {
      // Refresh token can arrive via secure cookie or request body
      const rawRefreshToken =
        req.cookies?.refreshToken || req.body?.refreshToken;

      const { accessToken, refreshToken: newRefreshToken } =
        await authService.refresh(rawRefreshToken);

      res.cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS);
      res.status(200).json({
        message: "Token refreshed successfully",
        accessToken,
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res, next) {
    try {
      const rawRefreshToken =
        req.cookies?.refreshToken || req.body?.refreshToken;

      await authService.logout(rawRefreshToken);
      res.clearCookie("refreshToken", {
        path: "/api/v1/auth",
        httpOnly: true,
        sameSite: "lax",
      });

      res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  },

  async getMe(req, res, next) {
    try {
      const user = await authService.getMe(req.user.id);
      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  },
};
