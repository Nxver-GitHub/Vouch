/**
 * Jev (typesafe/jev) on Workers AI — the cheap decision layer.
 *
 * Jev does NOT write and does NOT replace the engine probes. It only decides.
 * The 0-100 score and RANK stay in code. See BRIEF.md and CLAUDE.md.
 *
 * SHAPES BELOW ARE VERIFIED AGAINST A LIVE CALL (2026-09-28), not inferred.
 * Two things differ from the published docs and both would have been bugs:
 *
 *   1. env.AI.run() WRAPS the model output:
 *        { state: "Completed", result: { model, answers, usage }, gatewayMetadata }
 *      so you must read `.result.answers`, never `.answers`.
 *
 *   2. `noul` answers have NO `confidence` field. They return { noul: 0.96 }
 *      where the probability IS the signal. Gating a noul on `.confidence`
 *      silently drops every boolean answer.
 *
 * Observed cost: 504 input / 71 output tokens ≈ $0.000021 per batched call
 * at $0.042 per 1M input tokens, output free.
 */

import type { Ai } from '@cloudflare/workers-types';

export const JEV_MODEL = 'typesafe/jev' as const;
/** Jev's context ceiling: state + longest question. Stay well under it. */
export const JEV_MAX_TOKENS = 32_000;

/* ----------------------------- question types ----------------------------- */

/** Yes/no. `criteria` keys are literally "true" and "false". */
export type NoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria: { true: string; false: string };
};

/** One option from a set you define. `criteria` is option -> description. */
export type ChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
};

/** Position on a scale. `criteria` is an ORDERED ARRAY; index 0 is the low end. */
export type ScoreQuestion = {
  type: 'score';
  instructions: string;
  criteria: string[];
};

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

/* ------------------------------ answer types ------------------------------ */

export type NoulAnswer = {
  type: 'noul';
  /** Probability the answer is `true`, 0..1. There is NO confidence field. */
  noul: number;
};

export type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type ScoreAnswer = {
  type: 'score';
  /** Float over criteria indices, e.g. 1.99 ≈ the third criterion. */
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type JevResult = {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
};

/** What the binding actually hands back. */
type JevEnvelope = { state?: string; result?: JevResult };

/* ------------------------------ confidence -------------------------------- */

/**
 * Confidence policy, locked in code per the Citation brief.
 *   < 0.6   -> "to review", never shown in a customer-facing rate
 *   0.6-0.85 -> internal ranking and sorting only
 *   > 0.85  -> allowed into "fix these first"
 *
 * For `noul` there is no confidence field, so we derive one: a probability
 * near 0.5 is maximally uncertain, near 0 or 1 is confident.
 */
export function confidenceOf(a: JevAnswer): number {
  if (a.type === 'noul') return Math.abs(a.noul - 0.5) * 2;
  return a.confidence;
}

export const CONFIDENCE_REVIEW = 0.6;
export const CONFIDENCE_ACTIONABLE = 0.85;

export function isActionable(a: JevAnswer): boolean {
  return confidenceOf(a) > CONFIDENCE_ACTIONABLE;
}
export function isPublishable(a: JevAnswer): boolean {
  return confidenceOf(a) >= CONFIDENCE_REVIEW;
}

/** Resolve a score answer to the criterion it landed on. */
export function scoreLabel(a: ScoreAnswer): string {
  return a.legend[String(Math.round(a.score))] ?? `score ${a.score.toFixed(2)}`;
}

/** A noul is "true" when the probability clears one half. */
export function noulIsTrue(a: NoulAnswer): boolean {
  return a.noul > 0.5;
}

/* --------------------------------- runner --------------------------------- */

export type JevRun = {
  result: JevResult;
  /** USD, computed from real usage. Output is free at current pricing. */
  costUsd: number;
};

const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

/**
 * Run one batched Jev call. Batch every question that shares a state — they
 * cost one call, and a second call re-sends the whole state.
 *
 * `state` is UNTRUSTED data (engine answers, page text). Keep product
 * instructions in `questions.instructions`, never interpolated into state.
 */
export async function runJev(
  ai: Ai,
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>,
): Promise<JevRun> {
  const raw = (await ai.run(JEV_MODEL as never, { state, questions } as never)) as JevEnvelope;

  const result = raw?.result;
  if (!result?.answers) {
    // Fail loudly. Never fill a hole with a plausible value.
    throw new Error(`jev: unexpected envelope (state=${raw?.state ?? 'none'})`);
  }

  return {
    result,
    costUsd: (result.usage?.input_tokens ?? 0) * USD_PER_INPUT_TOKEN,
  };
}
