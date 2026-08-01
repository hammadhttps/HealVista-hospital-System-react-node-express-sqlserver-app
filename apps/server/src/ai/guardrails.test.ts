import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { AiGenerationError, generateValidated } from "./guardrails.js";
import { zodToGeminiSchema } from "./gemini.provider.js";
import { Type } from "@google/genai";
import type { AIProvider } from "./ai.provider.js";

vi.mock("../config/env.js", () => ({
  env: {
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "gemini-2.0-flash",
    GEMINI_EMBED_MODEL: "text-embedding-004",
  },
}));

const testSchema = z.object({
  summary: z.string(),
  flags: z.array(z.string()),
});

function mockProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    embed: vi.fn().mockResolvedValue([]),
    generate: vi.fn(),
    lastUsage: vi.fn().mockReturnValue({}),
    ...overrides,
  };
}

describe("generateValidated", () => {
  it("returns Zod-validated output from the provider", async () => {
    const provider = mockProvider({
      generate: vi.fn().mockResolvedValue({ summary: "ok", flags: ["a"] }),
    });
    const result = await generateValidated(provider, {
      feature: "test",
      prompt: "p",
      schema: testSchema,
    });
    expect(result).toEqual({ summary: "ok", flags: ["a"] });
  });

  it("retries once on malformed JSON, then succeeds", async () => {
    const provider = mockProvider({
      generate: vi
        .fn()
        .mockRejectedValueOnce(new Error("Unexpected token < in JSON at position 0"))
        .mockResolvedValueOnce({ summary: "recovered", flags: [] }),
    });
    const result = await generateValidated(provider, {
      feature: "test",
      prompt: "p",
      schema: testSchema,
    });
    expect(result).toEqual({ summary: "recovered", flags: [] });
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("throws AiGenerationError when output fails Zod validation on every attempt", async () => {
    const provider = mockProvider({
      generate: vi.fn().mockResolvedValue({ summary: 42 }),
    });
    await expect(
      generateValidated(provider, { feature: "test", prompt: "p", schema: testSchema }),
    ).rejects.toBeInstanceOf(AiGenerationError);
  });

  it("does not retry when the provider is simply not configured (503)", async () => {
    const provider = mockProvider({
      generate: vi.fn().mockRejectedValue(new AiGenerationError("not configured", 503)),
    });
    await expect(
      generateValidated(provider, { feature: "test", prompt: "p", schema: testSchema }),
    ).rejects.toBeInstanceOf(AiGenerationError);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("does not retry a safety-declined generation (422)", async () => {
    const provider = mockProvider({
      generate: vi.fn().mockRejectedValue(new AiGenerationError("declined", 422)),
    });
    await expect(
      generateValidated(provider, { feature: "test", prompt: "p", schema: testSchema }),
    ).rejects.toBeInstanceOf(AiGenerationError);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});

describe("zodToGeminiSchema", () => {
  it("converts an object with required and optional fields", () => {
    const schema = zodToGeminiSchema(
      z.object({ title: z.string(), notes: z.string().optional(), count: z.number() }),
    );
    expect(schema.type).toBe(Type.OBJECT);
    expect(schema.required).toEqual(["title", "count"]);
    expect(schema.properties?.title.type).toBe(Type.STRING);
    expect(schema.properties?.notes.type).toBe(Type.STRING);
    expect(schema.properties?.count.type).toBe(Type.NUMBER);
  });

  it("converts enums and arrays", () => {
    const schema = zodToGeminiSchema(
      z.object({ level: z.enum(["LOW", "HIGH"]), tags: z.array(z.string()) }),
    );
    expect(schema.properties?.level.format).toBe("enum");
    expect(schema.properties?.level.enum).toEqual(["LOW", "HIGH"]);
    expect(schema.properties?.tags.type).toBe(Type.ARRAY);
  });

  it("throws on unsupported types rather than silently weakening validation", () => {
    expect(() => zodToGeminiSchema(z.object({ when: z.date() }))).toThrow();
  });
});
