import { z } from "zod";
import { PASSWORD_REQUIREMENTS } from "@/constants";

const passwordSchema = z
  .string()
  .min(PASSWORD_REQUIREMENTS.minLength, `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
  .max(PASSWORD_REQUIREMENTS.maxLength, `Password must be at most ${PASSWORD_REQUIREMENTS.maxLength} characters`)
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/\d/, "Password must contain at least one number")
  .regex(/[@$!%*?&]/, "Password must contain at least one special character (@$!%*?&)");

export const registerSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const resendVerificationSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).trim().optional(),
  lastName:  z.string().min(1).max(50).trim().optional(),
  contact:   z.string().min(1).max(30).trim().optional(),
  address:   z.string().min(1).max(255).trim().optional(),
  dob:       z.coerce.date().optional(),
  nid:       z.string().regex(/^\d{20}$/, "NID must be exactly 20 digits").optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminUpdateUserSchema = z.object({
  // Access control
  role:             z.enum(["USER", "ADMIN", "MODERATOR"]).optional(),
  isActive:         z.boolean().optional(),
  // Profile fields
  firstName:        z.string().min(1).max(50).trim().optional(),
  lastName:         z.string().min(1).max(50).trim().optional(),
  contact:          z.string().min(1).max(30).trim().optional(),
  address:          z.string().min(1).max(255).trim().optional(),
  dob:              z.coerce.date().optional(),
  nid:              z.string().regex(/^\d{20}$/, "NID must be exactly 20 digits").optional(),
  // Organisational fields
  designation:      z.string().min(1).max(100).trim().optional(),
  department:       z.string().min(1).max(100).trim().optional(),
  position:         z.string().min(1).max(100).trim().optional(),
  identifierNumber: z.string().min(1).max(50).trim().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const adminForceActivateSchema = z.object({
  adminPassword: z.string().min(1, "Your password is required"),
});
export type AdminForceActivateInput = z.infer<typeof adminForceActivateSchema>;

// ── App management ────────────────────────────────────────────────────────────

export const createAppSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Name must be lowercase alphanumeric with hyphens").trim(),
  displayName: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  allowedIps: z.array(z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/, "Invalid IP address")).optional(),
});
export type CreateAppInput = z.infer<typeof createAppSchema>;

export const updateAppSchema = z.object({
  displayName: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
  allowedIps: z.array(z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/, "Invalid IP address")).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });
export type UpdateAppInput = z.infer<typeof updateAppSchema>;

// ── Feature management ────────────────────────────────────────────────────────

const featureInputSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Feature key must be snake_case").trim(),
  displayName: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
});

export const addFeatureSchema = featureInputSchema;
export type AddFeatureInput = z.infer<typeof addFeatureSchema>;

export const updateFeatureSchema = z.object({
  displayName: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });
export type UpdateFeatureInput = z.infer<typeof updateFeatureSchema>;

export const syncFeaturesSchema = z.object({
  secret: z.string().min(1, "App secret is required"),
  features: z.array(featureInputSchema).min(1, "Feature list cannot be empty"),
});
export type SyncFeaturesInput = z.infer<typeof syncFeaturesSchema>;

// ── Role management ───────────────────────────────────────────────────────────

export const createRoleSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, "Role name must be lowercase alphanumeric").trim(),
  displayName: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  isDefault: z.boolean().optional(),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  displayName: z.string().min(1).max(100).trim().optional(),
  description: z.string().max(500).trim().optional(),
  isDefault: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setRoleFeaturesSchema = z.object({
  featureIds: z.array(z.string().uuid()).min(0),
});
export type SetRoleFeaturesInput = z.infer<typeof setRoleFeaturesSchema>;

// ── User-app access ───────────────────────────────────────────────────────────

export const assignUserToAppSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  roleId: z.string().uuid("Invalid role ID").optional(),
});
export type AssignUserToAppInput = z.infer<typeof assignUserToAppSchema>;

export const updateUserAppSchema = z.object({
  roleId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });
export type UpdateUserAppInput = z.infer<typeof updateUserAppSchema>;

export const setUserFeaturesSchema = z.object({
  overrides: z.array(z.object({
    featureId: z.string().uuid(),
    granted: z.boolean(),
  })),
});
export type SetUserFeaturesInput = z.infer<typeof setUserFeaturesSchema>;

// ── Notification subscriptions ────────────────────────────────────────────────

const notifEventTypeEnum = z.enum(["APP_REGISTRATION", "FEATURE_SYNC", "USER_ACCESS_GRANTED", "USER_ACCESS_REVOKED", "ROLE_MODIFIED"]);

export const createNotifSubSchema = z.object({
  eventType: notifEventTypeEnum,
  appId: z.string().uuid().optional(),
});
export type CreateNotifSubInput = z.infer<typeof createNotifSubSchema>;

export const bulkCreateSubsSchema = z.object({
  adminIds: z.array(z.string().uuid("Invalid admin ID")).min(1, "At least one admin ID is required").max(100),
  eventType: notifEventTypeEnum,
  appId: z.string().uuid().optional(),
});
export type BulkCreateSubsInput = z.infer<typeof bulkCreateSubsSchema>;

export const sendDirectNotificationSchema = z.object({
  adminIds: z.array(z.string().uuid("Invalid admin ID")).min(1, "At least one admin ID is required").max(100),
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().min(1, "Body is required").max(5000),
  html: z.string().max(50000).optional(),
});
export type SendDirectNotificationInput = z.infer<typeof sendDirectNotificationSchema>;

// ── Internal ──────────────────────────────────────────────────────────────────

export const internalSyncFeaturesSchema = z.object({
  features: z.array(featureInputSchema).min(1),
});
export type InternalSyncFeaturesInput = z.infer<typeof internalSyncFeaturesSchema>;
