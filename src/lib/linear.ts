/**
 * Vouch — Linear client.
 *
 * Linear is cut-line item #6: it tracks the pipeline for us, it does not
 * gate it. Every export here resolves to a `LinearResult` instead of
 * throwing, so a caller can `await` it, log/emit the event, and move on
 * without try/catch ceremony at every call site. Do not let a Linear outage
 * abort a run.
 *
 * AUTH GOTCHA (verified): personal API keys go in `Authorization: <key>`
 * with NO `Bearer` prefix. `Bearer` is only for OAuth app tokens. Getting
 * this wrong doesn't 400 — it just 401s in a way that looks like a bad key.
 *
 * ERROR GOTCHA (verified, the single most important thing in this file):
 * Linear's GraphQL endpoint returns HTTP 200 even when the mutation
 * partially or fully failed. The failure only shows up in the `errors`
 * array of the JSON body. Never branch on `res.ok` / `res.status` alone —
 * always inspect `errors` first.
 */

import type { Env } from '../types';
import { redact } from './security';

const LINEAR_API = 'https://api.linear.app/graphql';

export type LinearResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type GraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

async function callLinear<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
): Promise<LinearResult<T>> {
  try {
    const res = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // No "Bearer" — Linear personal API keys are sent bare.
        authorization: env.LINEAR_API_KEY,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = (await res.json()) as GraphQlResponse<T>;

    // The load-bearing check: HTTP 200 does NOT mean success. Always look
    // at `errors` before trusting `data`.
    if (json.errors && json.errors.length > 0) {
      return { ok: false, error: redact(json.errors.map((e) => e.message).join('; ')) };
    }
    if (!res.ok) {
      return { ok: false, error: redact(`Linear HTTP ${res.status}`) };
    }
    if (!json.data) {
      return { ok: false, error: 'Linear returned no data and no errors' };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, error: redact(e) };
  }
}

export type CreatedIssue = { id: string; identifier: string; url: string };

const ISSUE_CREATE_MUTATION = `
  mutation VouchIssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }
`;

/**
 * Create a Linear issue in the Todo state for the configured team.
 * Failure is not fatal to a run — inspect the returned `LinearResult` and
 * keep going; the caller decides whether/how to surface it in the event log.
 */
export async function createIssue(
  env: Env,
  title: string,
  description: string,
): Promise<LinearResult<CreatedIssue>> {
  const result = await callLinear<{
    issueCreate: { success: boolean; issue: CreatedIssue | null };
  }>(env, ISSUE_CREATE_MUTATION, {
    input: {
      teamId: env.LINEAR_TEAM_ID,
      title,
      description,
      stateId: env.LINEAR_STATE_TODO,
    },
  });

  if (!result.ok) return result;
  const { success, issue } = result.data.issueCreate;
  if (!success || !issue) return { ok: false, error: 'issueCreate reported success=false' };
  return { ok: true, data: issue };
}

const ISSUE_UPDATE_MUTATION = `
  mutation VouchIssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { id identifier url }
    }
  }
`;

/**
 * Move an issue to a new state. State IDs come from env
 * (LINEAR_STATE_TODO | _AUDITED | _DEPLOYED | _OFFERED | _PAID) — never
 * resolved at runtime, so pass one of those verbatim as `stateId`.
 */
export async function moveIssue(
  env: Env,
  issueId: string,
  stateId: string,
): Promise<LinearResult<CreatedIssue>> {
  const result = await callLinear<{
    issueUpdate: { success: boolean; issue: CreatedIssue | null };
  }>(env, ISSUE_UPDATE_MUTATION, {
    id: issueId,
    input: { stateId },
  });

  if (!result.ok) return result;
  const { success, issue } = result.data.issueUpdate;
  if (!success || !issue) return { ok: false, error: 'issueUpdate reported success=false' };
  return { ok: true, data: issue };
}
