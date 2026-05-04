import { Router } from "express";
import { authController } from "@/controllers/auth.controller";
import { authenticate } from "@/middleware/auth.middleware";
import { validate } from "@/middleware/validation.middleware";
import { authRateLimiter, resendRateLimiter } from "@/middleware/rate-limit.middleware";
import { registerSchema, loginSchema, resendVerificationSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, refreshTokenSchema } from "@/utils/validation.schemas";

const router = Router();

// Public routes
router.post("/register", authRateLimiter, validate(registerSchema), authController.register);
router.post("/login", authRateLimiter, validate(loginSchema), authController.login);
router.post("/refresh", validate(refreshTokenSchema), authController.refreshTokens);
router.get("/verify-email", authController.verifyEmail);
router.post("/resend-verification", resendRateLimiter, validate(resendVerificationSchema), authController.resendVerification);
router.post("/forgot-password", authRateLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);

// Protected routes
router.get("/me", authenticate, authController.getMe);
router.post("/logout", authenticate, authController.logout);
router.post("/logout-all", authenticate, authController.logoutAll);
router.put("/change-password", authenticate, validate(changePasswordSchema), authController.changePassword);

export default router;
