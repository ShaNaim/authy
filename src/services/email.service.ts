import nodemailer from "nodemailer";
import { Job } from "bullmq";
import { env } from "@/config/env";
import logger from "@/utils/base.logger";
import { EmailJob, EMAIL_JOB_TYPES, startEmailWorker } from "@/services/queue.service";

function createTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn("SMTP not configured — emails will be logged only");
    return null;
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

const transporter = createTransporter();

async function sendMail(options: nodemailer.SendMailOptions): Promise<void> {
  if (!transporter) {
    logger.info("[EMAIL-DEV] Would send email", {
      to: options.to,
      subject: options.subject,
    });
    return;
  }
  await transporter.sendMail({
    from: env.EMAIL_FROM ?? `"Authy" <noreply@authy.local>`,
    ...options,
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

function verificationEmailHtml(token: string, userName?: string): string {
  const link = `${env.FRONTEND_URL}/verify-email?token=${token}`;
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:40px">
        <h2 style="color:#333">Verify your email address</h2>
        <p>Hi ${userName ?? "there"},</p>
        <p>Thanks for signing up! Please verify your email address by clicking the button below.</p>
        <p>This link expires in <strong>24 hours</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0">
          Verify Email
        </a>
        <p style="color:#666;font-size:14px">If you didn't create an account, you can safely ignore this email.</p>
        <p style="color:#999;font-size:12px">Or copy this link: ${link}</p>
      </div>
    </body></html>`;
}

function passwordResetEmailHtml(token: string, userName?: string): string {
  const link = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:40px">
        <h2 style="color:#333">Reset your password</h2>
        <p>Hi ${userName ?? "there"},</p>
        <p>We received a request to reset your password. Click the button below to choose a new password.</p>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#DC2626;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0">
          Reset Password
        </a>
        <p style="color:#666;font-size:14px">If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
        <p style="color:#999;font-size:12px">Or copy this link: ${link}</p>
      </div>
    </body></html>`;
}

function welcomeEmailHtml(userName?: string): string {
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:40px">
        <h2 style="color:#333">Welcome to Authy!</h2>
        <p>Hi ${userName ?? "there"},</p>
        <p>Your email has been verified and your account is now active. Welcome aboard!</p>
        <a href="${env.FRONTEND_URL}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0">
          Get Started
        </a>
      </div>
    </body></html>`;
}

function passwordChangedEmailHtml(userName?: string): string {
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:40px">
        <h2 style="color:#333">Password changed</h2>
        <p>Hi ${userName ?? "there"},</p>
        <p>Your password was successfully changed. If you did not make this change, please contact support immediately.</p>
      </div>
    </body></html>`;
}

// ── Job Processor ─────────────────────────────────────────────────────────────

async function processEmailJob(job: Job<EmailJob>): Promise<void> {
  const { data } = job;

  switch (data.type) {
    case EMAIL_JOB_TYPES.SEND_VERIFICATION:
      await sendMail({
        to: data.to,
        subject: "Verify your email address",
        html: verificationEmailHtml(data.token, data.userName),
      });
      break;

    case EMAIL_JOB_TYPES.SEND_PASSWORD_RESET:
      await sendMail({
        to: data.to,
        subject: "Reset your password",
        html: passwordResetEmailHtml(data.token, data.userName),
      });
      break;

    case EMAIL_JOB_TYPES.SEND_WELCOME:
      await sendMail({
        to: data.to,
        subject: "Welcome to Authy!",
        html: welcomeEmailHtml(data.userName),
      });
      break;

    case EMAIL_JOB_TYPES.SEND_PASSWORD_CHANGED:
      await sendMail({
        to: data.to,
        subject: "Your password has been changed",
        html: passwordChangedEmailHtml(data.userName),
      });
      break;
  }
}

export function startEmailWorkerService(): void {
  startEmailWorker(processEmailJob);
}

export { sendMail };
