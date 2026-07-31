import { z } from "zod";

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const typingSchema = z.object({
  threadId: z.string().uuid(),
});

export type TypingInput = z.infer<typeof typingSchema>;

export const chatPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ChatPaginationInput = z.infer<typeof chatPaginationSchema>;
