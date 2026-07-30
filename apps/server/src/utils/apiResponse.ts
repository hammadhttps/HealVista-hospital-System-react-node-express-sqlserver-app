import { Response } from "express";

export interface ApiResponseBody<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200, message?: string) {
  const body: ApiResponseBody<T> = { success: true, data, message };
  res.status(statusCode).json(body);
}

export function sendError(res: Response, statusCode: number, error: string, message?: string) {
  const body: ApiResponseBody = { success: false, error, message };
  res.status(statusCode).json(body);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  const body: ApiResponseBody<T[]> = {
    success: true,
    data,
    meta: { total, page, limit },
  };
  res.json(body);
}
