/**
 * AI-language keyword matcher (mvp-spec §2B) — REGEX ONLY, no LLM. The keyword
 * list is LOCKED in §2B and reproduced here EXACTLY: compound/marketing terms,
 * post-2023 vocabulary, and crucially bare "agent"/"agents" are EXCLUDED (only
 * "AI agent", "AI agents", "autonomous agent", "agentic" are in). Pure; never
 * throws; ReDoS-safe (each term is a literal between zero-width boundary
 * assertions — no quantifiers over untrusted text).
 */

/** The LOCKED §2B list (canonical casing kept for citation). */
export const AI_TERMS: readonly string[] = [
  "AI",
  "A.I.",
  "artificial intelligence",
  "AI-powered",
  "AI-driven",
  "AI-native",
  "AI-first",
  "powered by AI",
  "AI agent",
  "AI agents",
  "agentic",
  "autonomous agent",
  "AI assistant",
  "AI copilot",
  "copilot",
  "generative AI",
  "GenAI",
  "large language model",
  "LLM",
  "GPT",
  "machine learning",
  "neural network",
  "foundation model",
  "multimodal",
  "RAG",
  "retrieval-augmented",
  "fine-tuned",
  "vector search",
  "intelligent automation",
];

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Each term as a literal bounded by "not alphanumeric" on both sides, so "AI"
// matches "ai"/"a.i." but not "rain"/"email", and phrases match as phrases.
const PATTERNS: ReadonlyArray<{ term: string; re: RegExp }> = AI_TERMS.map((term) => ({
  term,
  re: new RegExp(`(?<![a-z0-9])${escapeRe(term.toLowerCase())}(?![a-z0-9])`),
}));

/** Reduce HTML to lowercased visible text: drop script/style, strip tags, collapse space. */
export function stripToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** PURE: the canonical AI terms present in the text (list order, deduped). */
export function matchAiTerms(input: string): string[] {
  try {
    const t = input.toLowerCase();
    const out: string[] = [];
    for (const { term, re } of PATTERNS) {
      if (re.test(t)) out.push(term);
    }
    return out;
  } catch {
    return [];
  }
}

/** The most specific (longest) matched term — for a meaningful citation. */
export function mostSpecific(terms: string[]): string | null {
  return terms.length ? terms.reduce((a, b) => (b.length > a.length ? b : a)) : null;
}
