/**
 * The Auditor — the agent the whole pitch rests on.
 *
 * Places gives us ground truth. The engines testify. Jev classifies each piece
 * of testimony against that truth. CODE computes the 0-100 score. Nothing here
 * ever asks a model for a number we then present as a measurement — that is
 * the claim we make on stage, so it is load-bearing, not stylistic.
 *
 * Pipeline: resolve -> probe -> classify -> score -> overlap -> persist.
 *
 * Grade bands and `gradeFor` are reused verbatim from Citation's scoring.ts.
 * Citation's rank x sentiment weighting is deliberately NOT ported: it scores
 * visibility, and this audit scores factual accuracy. Different axis, different
 * formula.
 */

import type { AgentEvent, Engine, Env, FactVerdict, PlaceFacts } from '../types';
import { ENGINE_VERSION } from '../types';
import { fetchPlaceFacts, PLACES_CALL_USD } from '../lib/places';
import {
  ACTIVE_ENGINES,
  buildOverlapProbe,
  buildProbes,
  maxCostFor,
  overlapPct,
  probeFor,
  type EngineAnswer,
  type ProbeOutcome,
  type ProbeQuestion,
} from '../lib/probe';
import {
  CONFIDENCE_REVIEW,
  confidenceOf,
  noulIsTrue,
  runJev,
  type ChoiceAnswer,
  type JevAnswer,
  type NoulAnswer,
  type ScoreAnswer,
} from '../lib/jev';
import { spendOrHalt, safeError, SYSTEM_DATA_ONLY, toSlug, wrapUntrusted } from '../lib/security';

/* ------------------------------- scoring model ---------------------------- */

/** Reused from Citation convex/lib/scoring.ts. */
export const GRADE_BANDS: readonly { min: number; grade: string }[] = [
  { min: 80, grade: 'A' },
  { min: 60, grade: 'B' },
  { min: 40, grade: 'C' },
  { min: 20, grade: 'D' },
  { min: 0, grade: 'F' },
];

export function gradeFor(score: number): string {
  for (const band of GRADE_BANDS) if (score >= band.min) return band.grade;
  return 'F';
}

/** How much each fact matters to a customer standing outside a closed door. */
export const FACT_WEIGHTS: Readonly<Record<FactVerdict['factKey'], number>> = {
  hours: 1.0,
  phone: 1.0,
  address: 1.0,
  open_now: 0.9,
  category: 0.7,
  reservations: 0.6,
};

/** Omitting a fact costs half of stating it wrongly: silence misleads less. */
export const MISSING_LOSS = 0.5;

/** Jev's severity scale, index-aligned with SEVERITY_CRITERIA below. */
export const SEVERITY_MULTIPLIER: readonly number[] = [0.5, 0.8, 1.0];

const SEVERITY_CRITERIA = [
  'minor: a customer would still reach the right place',
  'moderate: a customer would be inconvenienced or arrive at a bad time',
  'severe: a customer would go to the wrong place or find it closed',
];

const DEFAULT_STEP_LIMIT = 24;
const JEV_CALL_MAX_USD = 0.001;
const EXCERPT_CHARS = 160;

/* ---------------------------------- types --------------------------------- */

export type GradedFact = {
  verdict: FactVerdict;
  /** 0..2 index into SEVERITY_MULTIPLIER. */
  severityIndex: number;
  /** Lowest confidence across the Jev answers that gate this verdict. */
  confidence: number;
  /** Per-question confidences, kept so a review item can say WHICH one was weak. */
  confidences: { presence: number; correct: number; severity: number };
};

export type ReviewItem = {
  factKey: FactVerdict['factKey'];
  engine: Engine;
  confidence: number;
  reason: string;
  /** The same fact as a 'disputed' verdict: both values shown, excluded from the score. */
  verdict: FactVerdict;
};

export type ScoredAudit = { score: number; grade: string };

export type OverlapResult = NonNullable<AgentEvent['overlap']>;

export type AuditorInput = {
  runId: string;
  name: string;
  city: string;
  neighborhood?: string | null;
  /** Injected so probe strings are reproducible in tests. */
  now?: number;
};

export type AuditorResult = {
  businessId: string;
  slug: string;
  facts: PlaceFacts;
  verdicts: readonly FactVerdict[];
  review: readonly ReviewItem[];
  score: number;
  grade: string;
  overlap: OverlapResult | null;
  failures: readonly string[];
  spentUsd: number;
};

/* --------------------------------- plumbing -------------------------------- */

type EventDraft = Omit<AgentEvent, 'run_id' | 'ts' | 'agent'>;

/** Write one event and hand back the exact object the dashboard will render. */
async function emit(env: Env, runId: string, draft: EventDraft): Promise<AgentEvent> {
  const event: AgentEvent = { run_id: runId, ts: Date.now(), agent: 'auditor', ...draft };
  const payload = {
    business: event.business,
    competitors: event.competitors,
    score: event.score,
    grade: event.grade,
    rank: event.rank,
    url: event.url,
    facts: event.facts,
    overlap: event.overlap,
    cost: event.cost,
  };
  const hasPayload = Object.values(payload).some((value) => value !== undefined);
  await env.DB.prepare(
    'INSERT INTO events (run_id, agent, state, message, payload_json, ts) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(runId, 'auditor', event.state, event.message, hasPayload ? JSON.stringify(payload) : null, event.ts)
    .run();
  return event;
}

/**
 * Step limiter. The counter is mutable by nature — it is a budget being spent,
 * not a value being transformed — and stays sealed inside this closure.
 */
type StepBudget = { take: (label: string) => void };

function stepBudget(env: Env): StepBudget {
  const configured = Number(env.AGENT_STEP_LIMIT);
  const max = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STEP_LIMIT;
  let used = 0;
  return {
    take(label: string): void {
      used += 1;
      if (used > max) throw new Error(`auditor: step limit ${max} exceeded at "${label}"`);
    },
  };
}

/** Spend guard around one paid call. Fails loudly; never degrades silently. */
async function paid<T>(
  env: Env,
  runId: string,
  bucket: 'engines' | 'decide',
  maxUsd: number,
  run: () => Promise<{ value: T; costUsd: number }>,
): Promise<T> {
  // ONE D1 query: the gate and the ledger write are a single atomic statement.
  // D1's free tier allows 50 queries per invocation and this helper is called
  // on every probe, so the old assert-then-record pair was the single biggest
  // consumer of that budget.
  //
  // We reserve the WORST-CASE cost up front rather than the actual. That is
  // deliberate on two counts: the call may be billed upstream even if it throws
  // (an HTTP 200 that fails to parse still costs money), and reserving high
  // trips the cap early. A ledger that under-reports turns a hard cap into an
  // invoice. The true per-call cost is still tracked in AuditorResult.spentUsd
  // for the figure the dashboard shows.
  const reserved = await spendOrHalt(env.DB, runId, bucket, maxUsd);
  if (!reserved) {
    throw new Error('auditor: budget cap reached — run halted before spending');
  }

  const { value } = await run();
  return value;
}

function excerpt(text: string): string {
  // Engines answer in markdown; the sheet shows plain words. Strip emphasis
  // markers and heading hashes, never the words themselves.
  const flat = text
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS)}…` : flat;
}

/* ------------------------------ 1. resolve -------------------------------- */

export type ResolvedBusiness = { id: string; slug: string; facts: PlaceFacts };

/**
 * Write the business row, returning the slug actually claimed. `place_id` is
 * the natural key: re-auditing the same business must never fork a row.
 */
async function upsertBusiness(
  env: Env,
  input: AuditorInput,
  facts: PlaceFacts,
  slug: string,
): Promise<string> {
  await env.DB.prepare(
    'INSERT INTO businesses (id, slug, name, place_id, category, neighborhood, city, address, phone, ' +
      'website, rating, rating_count, hours_json, status, created_at) ' +
      "VALUES (?1, ?2, ?3, ?1, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'new', ?13) " +
      'ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name, ' +
      'category = excluded.category, address = excluded.address, phone = excluded.phone, ' +
      'website = excluded.website, rating = excluded.rating, ' +
      'rating_count = excluded.rating_count, hours_json = excluded.hours_json',
  )
    .bind(
      facts.place_id,
      slug,
      facts.name,
      facts.category,
      input.neighborhood ?? null,
      input.city,
      facts.address,
      facts.phone,
      facts.website,
      facts.rating,
      facts.rating_count,
      JSON.stringify(facts.hours),
      Date.now(),
    )
    .run();
  return slug;
}

/** Places is the ground truth. One call, then an idempotent upsert. */
export async function resolveBusiness(
  env: Env,
  input: AuditorInput,
  steps: StepBudget,
): Promise<ResolvedBusiness> {
  steps.take('places');
  const facts = await paid(env, input.runId, 'engines', PLACES_CALL_USD, async () => ({
    value: await fetchPlaceFacts(env, input.name, input.city),
    costUsd: PLACES_CALL_USD,
  }));

  // `slug` carries its own UNIQUE constraint, independent of the id. Two
  // genuinely different businesses can normalise to the same slug ("Joe's
  // Pizza" in two cities) — common enough in this product that letting the
  // constraint abort a legitimate onboarding is not acceptable. Qualify with
  // the city and retry once; a second failure is a real error and propagates.
  const slug = await upsertBusiness(env, input, facts, toSlug(facts.name)).catch(() =>
    upsertBusiness(env, input, facts, toSlug(`${facts.name} ${input.city}`)),
  );

  return { id: facts.place_id, slug, facts };
}

/* -------------------------------- 2. probe -------------------------------- */

/** One engine, one probe. Failures are recorded, never papered over. */
async function runOneProbe(
  env: Env,
  runId: string,
  engine: Engine,
  probe: ProbeQuestion,
  steps: StepBudget,
): Promise<ProbeOutcome> {
  steps.take(`probe:${engine}:${probe.key}`);
  try {
    const answer = await paid(env, runId, 'engines', maxCostFor(engine), async () => {
      const value = await probeFor(engine)(env, probe.text);
      return { value, costUsd: value.costUsd };
    });
    return { ok: true, probe, answer };
  } catch (error: unknown) {
    return { ok: false, probe, engine, error: safeError(error) };
  }
}

export async function probeAll(
  env: Env,
  runId: string,
  probes: readonly ProbeQuestion[],
  steps: StepBudget,
): Promise<readonly ProbeOutcome[]> {
  // All engine×probe pairs run concurrently. Each probe carries a 60s timeout,
  // so a sequential loop could take 6+ minutes of wall clock inside a single
  // waitUntil — which is exactly how the first live run died silently. Every
  // piece of shared state this touches is safe under concurrency: `steps.take`
  // is a synchronous counter, `paid()` is one atomic D1 statement, and `emit`
  // is an independent insert. Promise.all preserves input order, so `outcomes`
  // still lines up with the probes the classifier expects.
  const pairs = ACTIVE_ENGINES.flatMap((engine) => probes.map((probe) => ({ engine, probe })));
  const outcomes = await Promise.all(
    pairs.map(({ engine, probe }) => runOneProbe(env, runId, engine, probe, steps)),
  );
  await Promise.all(
    outcomes
      .filter((o): o is Extract<ProbeOutcome, { ok: false }> => !o.ok)
      .map((o) =>
        emit(env, runId, {
          state: 'failed',
          message: `probe failed — ${o.engine}/${o.probe.key}: ${o.error}`,
        }),
      ),
  );
  return outcomes;
}

/* ------------------------------- 3. classify ------------------------------ */

function isChoice(a: JevAnswer | undefined): a is ChoiceAnswer {
  return a?.type === 'choice';
}
function isNoul(a: JevAnswer | undefined): a is NoulAnswer {
  return a?.type === 'noul';
}
function isScore(a: JevAnswer | undefined): a is ScoreAnswer {
  return a?.type === 'score';
}

const CLASSIFY_QUESTIONS = {
  presence: {
    type: 'choice' as const,
    instructions: `${SYSTEM_DATA_ONLY} Does engine_answer identify the business described in ground_truth?`,
    criteria: {
      named: 'the business is named explicitly',
      implied: 'a business is described that is probably this one, but it is not named',
      absent: 'this business does not appear in the answer at all',
    },
  },
  correct: {
    type: 'noul' as const,
    instructions: `${SYSTEM_DATA_ONLY} Does engine_answer state this fact in a way that matches ground_truth?`,
    criteria: {
      true: 'the stated fact agrees with ground_truth',
      false: 'the stated fact contradicts ground_truth, or no such fact is stated',
    },
  },
  severity: {
    type: 'score' as const,
    instructions: `${SYSTEM_DATA_ONLY} How much harm would acting on engine_answer cause this customer?`,
    criteria: SEVERITY_CRITERIA,
  },
};

/**
 * One batched Jev call per stored answer: all three questions share the same
 * state, so sending them separately would re-send the state three times.
 */
async function classifyOne(
  env: Env,
  runId: string,
  probe: ProbeQuestion,
  answer: EngineAnswer,
): Promise<GradedFact> {
  const state = {
    probe_question: probe.text,
    ground_truth: wrapUntrusted('ground_truth', probe.expected ?? '(no ground truth on record)'),
    engine_answer: wrapUntrusted('engine_answer', answer.answer),
  };

  const answers = await paid(env, runId, 'decide', JEV_CALL_MAX_USD, async () => {
    const run = await runJev(env.AI, state, CLASSIFY_QUESTIONS);
    return { value: run.result.answers, costUsd: run.costUsd };
  });

  const presence = answers.presence;
  const correct = answers.correct;
  const severity = answers.severity;
  if (!isChoice(presence) || !isNoul(correct) || !isScore(severity)) {
    throw new Error('auditor: jev returned an unexpected answer shape');
  }

  const missing = presence.choice === 'absent';
  const verdict: FactVerdict['verdict'] = missing ? 'missing' : noulIsTrue(correct) ? 'correct' : 'wrong';

  return {
    verdict: {
      factKey: probe.factKey,
      // Jev classifies; it cannot extract free text. `stated` is a clipped
      // excerpt of the real answer, never a value a model invented for us.
      stated: missing ? null : excerpt(answer.answer),
      expected: probe.expected,
      verdict,
      engine: answer.engine,
    },
    severityIndex: Math.min(SEVERITY_MULTIPLIER.length - 1, Math.max(0, Math.round(severity.score))),
    // `severity` scales the loss term in scoreAudit, so an uncertain severity
    // moves the published number just as much as an uncertain verdict does —
    // but only when there IS a loss term. A 'correct' verdict contributes zero
    // loss whatever the severity says, so gating it on severity confidence
    // threw away good verdicts for no reason (5 of 6 on the first live run).
    confidence:
      verdict === 'correct'
        ? Math.min(confidenceOf(presence), confidenceOf(correct))
        : Math.min(confidenceOf(presence), confidenceOf(correct), confidenceOf(severity)),
    confidences: {
      presence: confidenceOf(presence),
      correct: confidenceOf(correct),
      severity: confidenceOf(severity),
    },
  };
}

export type Classification = { graded: readonly GradedFact[]; review: readonly ReviewItem[] };

/** Below CONFIDENCE_REVIEW a verdict is a question, not a finding. */
export async function classify(
  env: Env,
  runId: string,
  outcomes: readonly ProbeOutcome[],
  steps: StepBudget,
): Promise<Classification> {
  const graded: GradedFact[] = [];
  const review: ReviewItem[] = [];

  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    steps.take(`classify:${outcome.probe.key}`);
    let fact: GradedFact;
    try {
      fact = await classifyOne(env, runId, outcome.probe, outcome.answer);
    } catch (error: unknown) {
      // One malformed Jev answer must not discard the other five verdicts and
      // the money already spent on them. It becomes a review item instead.
      review.push({
        factKey: outcome.probe.factKey,
        engine: outcome.answer.engine,
        confidence: 0,
        reason: `classification failed: ${safeError(error)}`,
        verdict: {
          factKey: outcome.probe.factKey,
          stated: excerpt(outcome.answer.answer),
          expected: outcome.probe.expected,
          verdict: 'disputed',
          engine: outcome.answer.engine,
        },
      });
      continue;
    }
    if (fact.confidence < CONFIDENCE_REVIEW) {
      review.push({
        factKey: fact.verdict.factKey,
        engine: fact.verdict.engine,
        confidence: fact.confidence,
        reason:
          `below the ${CONFIDENCE_REVIEW} confidence floor — excluded from the published score ` +
          `(presence ${fact.confidences.presence.toFixed(2)}, correct ${fact.confidences.correct.toFixed(2)}, ` +
          `severity ${fact.confidences.severity.toFixed(2)})`,
        verdict: { ...fact.verdict, verdict: 'disputed' },
      });
      continue;
    }
    graded.push(fact);
  }

  return { graded, review };
}

/* --------------------------------- 4. score ------------------------------- */

/**
 * THE SCORE IS COMPUTED HERE, IN CODE. No model sees this number.
 *
 *   loss_i   = 0                       when the fact is correct
 *            = MISSING_LOSS * sev_i    when the fact is missing
 *            = 1.0 * sev_i             when the fact is wrong
 *   credit_i = 1 - loss_i, clamped to [0, 1]
 *   score    = 100 * Σ(w_i * credit_i) / Σ w_i
 *
 * w_i is FACT_WEIGHTS[factKey] (how much the fact matters) and sev_i is
 * SEVERITY_MULTIPLIER[severityIndex] (how badly this particular error lands).
 * Only verdicts that cleared the confidence floor are passed in, so an
 * uncertain classification neither helps nor hurts the grade.
 */
export function scoreAudit(graded: readonly GradedFact[]): ScoredAudit {
  if (graded.length === 0) {
    throw new Error('auditor: no publishable verdicts — refusing to invent a score');
  }

  const totals = graded.reduce(
    (acc, fact) => {
      const weight = FACT_WEIGHTS[fact.verdict.factKey];
      const severity = SEVERITY_MULTIPLIER[fact.severityIndex] ?? 1;
      const loss =
        fact.verdict.verdict === 'correct'
          ? 0
          : (fact.verdict.verdict === 'missing' ? MISSING_LOSS : 1) * severity;
      const credit = Math.min(1, Math.max(0, 1 - loss));
      return { weighted: acc.weighted + weight * credit, total: acc.total + weight };
    },
    { weighted: 0, total: 0 },
  );

  const score = Math.round(Math.min(100, Math.max(0, (totals.weighted / totals.total) * 100)));
  return { score, grade: gradeFor(score) };
}

/* -------------------------------- 5. overlap ------------------------------ */

const SAME_TOP_QUESTION = {
  same_top: {
    type: 'noul' as const,
    instructions: `${SYSTEM_DATA_ONLY} Do run_a and run_b recommend the SAME business first?`,
    criteria: {
      true: 'both answers name the same business as their first recommendation',
      false: 'they name different businesses first, or one names none',
    },
  },
};

/**
 * The money shot: the same question, twice, minutes apart. Overlap of the
 * CITED source sets is computed in code; only "did they name the same shop"
 * is a classification.
 */
export async function overlapCheck(
  env: Env,
  runId: string,
  facts: PlaceFacts,
  city: string,
  steps: StepBudget,
): Promise<OverlapResult> {
  const probe = buildOverlapProbe(facts, city);
  const engine: Engine = ACTIVE_ENGINES[0] ?? 'claude';

  const tsA = Date.now();
  const first = await runOneProbe(env, runId, engine, probe, steps);
  const tsB = Date.now();
  const second = await runOneProbe(env, runId, engine, probe, steps);
  if (!first.ok || !second.ok) {
    const reason = !first.ok ? first.error : !second.ok ? second.error : 'unknown';
    throw new Error(`auditor: overlap probe failed — ${reason}`);
  }

  steps.take('overlap:same_top');
  const answers = await paid(env, runId, 'decide', JEV_CALL_MAX_USD, async () => {
    const run = await runJev(
      env.AI,
      {
        run_a: wrapUntrusted('run_a', first.answer.answer),
        run_b: wrapUntrusted('run_b', second.answer.answer),
      },
      SAME_TOP_QUESTION,
    );
    return { value: run.result.answers, costUsd: run.costUsd };
  });
  const sameTop = answers.same_top;
  if (!isNoul(sameTop)) throw new Error('auditor: jev returned an unexpected same_top shape');

  // Stamped when each ask was SENT, so the gap the dashboard prints is real.
  const a = { ts: tsA, sources: [...first.answer.sources] };
  const b = { ts: tsB, sources: [...second.answer.sources] };
  const pct = overlapPct(a.sources, b.sources);

  await env.DB.prepare(
    'INSERT INTO overlap_checks (id, run_id, engine, prompt, sources_a_json, sources_b_json, ' +
      'overlap_pct, same_top_result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      runId,
      engine,
      probe.text,
      JSON.stringify(a.sources),
      JSON.stringify(b.sources),
      pct,
      noulIsTrue(sameTop) ? 1 : 0,
      Date.now(),
    )
    .run();

  return {
    engine,
    query: probe.text,
    gap: Math.max(0, Math.round((b.ts - a.ts) / 1000)),
    a,
    b,
    top_business_same: noulIsTrue(sameTop),
  };
}

/* -------------------------------- 6. persist ------------------------------ */

async function writeAudit(
  env: Env,
  input: AuditorInput,
  businessId: string,
  engine: Engine,
  probes: readonly ProbeQuestion[],
  outcomes: readonly ProbeOutcome[],
  graded: readonly GradedFact[],
  scored: ScoredAudit,
): Promise<void> {
  const answers = outcomes.filter((o): o is Extract<ProbeOutcome, { ok: true }> => o.ok);
  await env.DB.prepare(
    'INSERT INTO audits (id, run_id, business_id, engine, engine_version, prompts_json, answers_json, ' +
      'citations_json, score, grade, errors_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      input.runId,
      businessId,
      engine,
      ENGINE_VERSION,
      JSON.stringify(probes.map((p) => ({ key: p.key, text: p.text, expected: p.expected }))),
      JSON.stringify(answers.map((o) => ({ key: o.probe.key, answer: o.answer.answer }))),
      JSON.stringify(answers.flatMap((o) => o.answer.sources)),
      scored.score,
      scored.grade,
      JSON.stringify(graded.map((g) => g.verdict)),
      Date.now(),
    )
    .run();
}

/* --------------------------------- the agent ------------------------------ */

export async function runAuditor(env: Env, input: AuditorInput): Promise<AuditorResult> {
  const steps = stepBudget(env);
  const now = input.now ?? Date.now();

  await emit(env, input.runId, { state: 'working', message: `resolving ${input.name} in ${input.city}` });
  const business = await resolveBusiness(env, input, steps).catch(async (error: unknown) => {
    // Ground truth is the axis every verdict is scored against. If Places
    // fails we stop — loudly and redacted — rather than audit against nothing.
    const detail = safeError(error);
    await emit(env, input.runId, { state: 'failed', message: `could not resolve ground truth: ${detail}` });
    throw new Error(`auditor: resolve failed — ${detail}`);
  });

  const probes = buildProbes(business.facts, input.city, now);
  // No `business` panel yet: `lit` is not known until the engines have answered,
  // and a placeholder false would be exactly the plausible value we refuse to ship.
  await emit(env, input.runId, {
    state: 'probing',
    message: `asking ${ACTIVE_ENGINES.join(', ')} ${probes.length} fact questions`,
  });

  const outcomes = await probeAll(env, input.runId, probes, steps);
  const failures = outcomes.filter((o) => !o.ok).map((o) => (o.ok ? '' : `${o.probe.key}: ${o.error}`));

  const { graded, review } = await classify(env, input.runId, outcomes, steps);
  const scored = scoreAudit(graded);

  await writeAudit(env, input, business.id, ACTIVE_ENGINES[0] ?? 'claude', probes, outcomes, graded, scored);

  // `lit` means the engines actually named this business — derived from the
  // verdicts, never assumed. A 'missing' verdict is the engine failing to find
  // it at all, so anything else counts as lit.
  const lit = graded.some((fact) => fact.verdict.verdict !== 'missing');

  await emit(env, input.runId, {
    state: 'working',
    message: `${scored.score}/100 (${scored.grade}) from ${graded.length} verdicts, ${review.length} disputed`,
    score: scored.score,
    business: { slug: business.slug, name: business.facts.name, lit, category: business.facts.category },
    // types.ts calls this panel "the wrong/missing sheet" — send what is
    // actually wrong, not every verdict we formed.
    // Wrong, missing AND disputed: everything the owner should look at.
    facts: [...graded, ...review]
      .filter((g) => g.verdict.verdict !== 'correct')
      .map((g) => ({
        key: g.verdict.factKey,
        stated: g.verdict.stated,
        expected: g.verdict.expected,
        engine: g.verdict.engine,
        verdict: g.verdict.verdict,
      })),
  });

  // The overlap check is the last step and one of the priciest (two more
  // engine calls plus a Jev call), so it is the most likely to hit an
  // exhausted budget. By this point the audit is already scored and persisted.
  // Throwing here would discard a complete, valuable result; instead we report
  // the failure loudly in the event stream and in `failures`, and return
  // `overlap: null`.
  const overlapOutcome = await overlapCheck(env, input.runId, business.facts, input.city, steps).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error: safeError(error) }),
  );

  await emit(
    env,
    input.runId,
    overlapOutcome.ok
      ? {
          state: 'done',
          message: `${Math.round(
            overlapPct(overlapOutcome.value.a.sources, overlapOutcome.value.b.sources) * 100,
          )}% source overlap between two identical asks`,
          overlap: overlapOutcome.value,
        }
      : { state: 'done', message: `scored, but the overlap check failed: ${overlapOutcome.error}` },
  );

  return {
    businessId: business.id,
    slug: business.slug,
    facts: business.facts,
    // Disputed facts are part of the record the owner sees; they are NOT part
    // of the number (scoreAudit only ever saw `graded`).
    verdicts: [...graded.map((g) => g.verdict), ...review.map((r) => r.verdict)],
    review,
    score: scored.score,
    grade: scored.grade,
    overlap: overlapOutcome.ok ? overlapOutcome.value : null,
    failures: overlapOutcome.ok ? failures : [...failures, `overlap: ${overlapOutcome.error}`],
    spentUsd: outcomes.reduce((sum, o) => sum + (o.ok ? o.answer.costUsd : 0), PLACES_CALL_USD),
  };
}
