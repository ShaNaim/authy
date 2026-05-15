import { OrgPlan } from "@prisma/client";

export interface PlanLimits {
  maxMauPerMonth: number;
  maxApps: number;
  maxFeatureKeys: number;
  maxApiCallsPerDay: number;
  logRetentionDays: number;
  maxWebhooks: number;
  maxApiKeys: number;
  maxOAuthApps: number;
}

export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  FREE: {
    maxMauPerMonth: 1_000,
    maxApps: 2,
    maxFeatureKeys: 20,
    maxApiCallsPerDay: 5_000,
    logRetentionDays: 7,
    maxWebhooks: 2,
    maxApiKeys: 2,
    maxOAuthApps: 1,
  },
  STARTER: {
    maxMauPerMonth: 10_000,
    maxApps: 10,
    maxFeatureKeys: 100,
    maxApiCallsPerDay: 50_000,
    logRetentionDays: 30,
    maxWebhooks: 10,
    maxApiKeys: 10,
    maxOAuthApps: 5,
  },
  PRO: {
    maxMauPerMonth: 100_000,
    maxApps: 50,
    maxFeatureKeys: 500,
    maxApiCallsPerDay: 500_000,
    logRetentionDays: 90,
    maxWebhooks: 50,
    maxApiKeys: 50,
    maxOAuthApps: 20,
  },
  ENTERPRISE: {
    maxMauPerMonth: Number.MAX_SAFE_INTEGER,
    maxApps: Number.MAX_SAFE_INTEGER,
    maxFeatureKeys: Number.MAX_SAFE_INTEGER,
    maxApiCallsPerDay: Number.MAX_SAFE_INTEGER,
    logRetentionDays: 365,
    maxWebhooks: Number.MAX_SAFE_INTEGER,
    maxApiKeys: Number.MAX_SAFE_INTEGER,
    maxOAuthApps: Number.MAX_SAFE_INTEGER,
  },
};

export const QUOTA_ERROR_CODE = "PLAN_LIMIT_EXCEEDED";
