import { Response } from "express";
import { HTTP_STATUS } from "@/constants";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId?: string;
    timestamp: string;
  };
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function sendSuccess<T>(res: Response, data: T, statusCode: number = HTTP_STATUS.OK, requestId?: string): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
  res.status(statusCode).json(response);
}

export function sendCreated<T>(res: Response, data: T, requestId?: string): void {
  sendSuccess(res, data, HTTP_STATUS.CREATED, requestId);
}

export function sendNoContent(res: Response): void {
  res.status(HTTP_STATUS.NO_CONTENT).send();
}

export function sendError(res: Response, statusCode: number, errorCode: string, message: string, details?: unknown, requestId?: string): void {
  const response: ApiResponse<never> = {
    success: false,
    error: { code: errorCode, message, details },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
  res.status(statusCode).json(response);
}

export function sendPaginated<T>(res: Response, items: T[], total: number, page: number, limit: number, requestId?: string): void {
  const data: PaginatedData<T> = {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
  sendSuccess(res, data, HTTP_STATUS.OK, requestId);
}
