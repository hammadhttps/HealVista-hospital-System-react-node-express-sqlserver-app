import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.validated);
    sendSuccess(res, result, 201, "Registration successful. Verify your email.");
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = req.ip || req.socket.remoteAddress;
    const result = await authService.login(req.validated, ip);

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    sendSuccess(res, {
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) {
      throw new AppError("Refresh token required", 401);
    }
    const result = await authService.refresh(token);

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    sendSuccess(res, {
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(req.user!.userId, req.user!.sessionId!);
    res.clearCookie("refreshToken", { path: "/api/auth" });
    sendSuccess(res, null, 200, "Logged out");
  } catch (err) {
    next(err);
  }
}

export async function logoutAll(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logoutAll(req.user!.userId);
    res.clearCookie("refreshToken", { path: "/api/auth" });
    sendSuccess(res, null, 200, "Logged out from all devices");
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.user!.userId);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.verifyEmail(req.validated.token);
    sendSuccess(res, null, 200, "Email verified");
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.changePassword(
      req.user!.userId,
      req.validated.currentPassword,
      req.validated.newPassword,
    );
    sendSuccess(res, null, 200, "Password changed");
  } catch (err) {
    next(err);
  }
}

export async function getSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await authService.getSessions(req.user!.userId);
    sendSuccess(res, sessions);
  } catch (err) {
    next(err);
  }
}

export async function revokeSession(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.revokeSession(req.user!.userId, req.params.id as string);
    sendSuccess(res, null, 200, "Session revoked");
  } catch (err) {
    next(err);
  }
}

export async function resendVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.resendVerification(req.validated.email);
    sendSuccess(res, result, 200, "Verification email sent");
  } catch (err) {
    next(err);
  }
}

export async function changeEmail(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.changeEmail(req.user!.userId, req.validated.newEmail, req.validated.password);
    sendSuccess(res, null, 200, "Email changed. Please verify your new email.");
  } catch (err) {
    next(err);
  }
}

export async function changePhone(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.changePhone(req.user!.userId, req.validated.newPhone, req.validated.password);
    sendSuccess(res, null, 200, "Phone number changed");
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.updateProfile(req.user!.userId, req.validated);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}
