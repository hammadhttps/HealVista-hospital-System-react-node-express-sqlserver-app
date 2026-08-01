import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import {
  clearSearchHistory,
  deleteSavedSearch,
  getSavedSearches,
  getSearchHistory,
  globalSearch,
  saveSearch,
} from "../services/search.service.js";
import type { SaveSearchInput, SearchQueryInput } from "@healvista/shared";

export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, limit } = (req.validated ?? req.query) as SearchQueryInput;
    const data = await globalSearch(req.user!.userId, req.user!.role, q, limit, req.ip);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function history(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getSearchHistory(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function clearHistory(req: Request, res: Response, next: NextFunction) {
  try {
    await clearSearchHistory(req.user!.userId);
    sendSuccess(res, { cleared: true });
  } catch (err) {
    next(err);
  }
}

export async function listSaved(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await getSavedSearches(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function createSaved(req: Request, res: Response, next: NextFunction) {
  try {
    const { query, label } = (req.validated ?? req.body) as SaveSearchInput;
    sendSuccess(res, await saveSearch(req.user!.userId, query, label), 201);
  } catch (err) {
    next(err);
  }
}

export async function removeSaved(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteSavedSearch(req.user!.userId, String(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}
