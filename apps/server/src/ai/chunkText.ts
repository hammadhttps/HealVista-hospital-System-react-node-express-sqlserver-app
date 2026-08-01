/**
 * Chunking for the embedding pipeline.
 *
 * ~500 tokens per chunk (~2000 chars at a 4 chars/token heuristic), ~50-token
 * overlap (~200 chars), split on paragraph boundaries. A SOAP note usually fits
 * in one chunk; a long lab report becomes several. `chunkIndex` lets retrieved
 * fragments be re-ordered.
 */

const CHARS_PER_TOKEN = 4;

export interface Chunk {
  text: string;
  tokenCount: number;
  index: number;
}

export interface ChunkOptions {
  /** Approximate target size in tokens. */
  maxTokens?: number;
  /** Approximate overlap between consecutive chunks in tokens. */
  overlapTokens?: number;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  const maxTokens = opts.maxTokens ?? 500;
  const overlapTokens = opts.overlapTokens ?? 50;
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;

  if (!text) return [];

  // Paragraph-split on blank lines, falling back to single newlines. This keeps
  // clinical structure (a SOAP section, a lab test block) intact within a chunk.
  const paragraphs = text
    .split(/\n\s*\n|\n(?=[A-Z0-9#•*])/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunks: Chunk[] = [];
  let buffer = "";
  let prevOverlap = "";

  for (const paragraph of paragraphs) {
    // A single paragraph bigger than the target splits on sentence boundaries.
    if (paragraph.length > maxChars) {
      if (buffer.trim()) chunks.push(makeChunk(chunks.length, buffer));
      const sentences = paragraph.match(/[^.!?]+[.!?]+[)"]?|\S+$/g) ?? [paragraph];
      let part = "";
      for (const sentence of sentences) {
        if (part && part.length + sentence.length > maxChars) {
          chunks.push(makeChunk(chunks.length, part));
          part = sentence;
        } else {
          part += part ? " " + sentence : sentence;
        }
      }
      if (part.trim()) {
        const next = prevOverlap;
        chunks.push(makeChunk(chunks.length, (next ? next + "\n" : "") + part));
      }
      buffer = "";
      prevOverlap = tail(part, overlapChars);
      continue;
    }

    if (buffer && buffer.length + paragraph.length + 1 > maxChars) {
      // Close the current chunk, carrying an overlap of its tail into the next.
      chunks.push(makeChunk(chunks.length, buffer));
      prevOverlap = tail(buffer, overlapChars);
      buffer = prevOverlap;
    }

    buffer += (buffer ? "\n" : "") + paragraph;
  }

  if (buffer.trim()) chunks.push(makeChunk(chunks.length, buffer));

  // Guard against an empty leading overlap-only chunk (rare).
  return chunks.filter((c) => c.text.trim().length > 0);
}

function makeChunk(index: number, text: string): Chunk {
  return { text: text.trim(), tokenCount: estimateTokens(text), index };
}

function tail(text: string, chars: number): string {
  if (text.length <= chars) return text;
  const cut = text.slice(-chars);
  const newline = cut.indexOf("\n");
  return newline === -1 ? cut : cut.slice(newline + 1);
}
