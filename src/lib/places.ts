/**
 * Google Places (New) — the ground truth an audit is scored against.
 *
 * ONE call per business. `X-Goog-FieldMask` is MANDATORY: without it the API
 * 400s. The mask below was confirmed live on 2026-09-28 and returns every
 * field `PlaceFacts` needs.
 *
 * `places.reviews` is deliberately ABSENT from the mask. Adding it escalates
 * the SKU to Enterprise+Atmosphere ($40/1k, only 1k free per month); without
 * it we stay on the $35/1k tier. We never score against reviews, so the extra
 * spend would buy nothing.
 *
 * Everything this module returns is UNTRUSTED third-party text. Callers must
 * wrap it with `wrapUntrusted` before it reaches any model.
 */

import type { Env, PlaceFacts } from '../types';
import { redact } from './security';

export const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

/** Verified live 2026-09-28. Do not add `places.reviews` — see file header. */
export const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.primaryTypeDisplayName',
].join(',');

/** Text Search without the Atmosphere fields: $35 per 1,000 calls. */
export const PLACES_CALL_USD = 0.035;

const PLACES_TIMEOUT_MS = 10_000;

/* ----------------------------- narrowing helpers -------------------------- */
/* The response is `unknown` until proven otherwise. No `any`, no casts that   */
/* assert a shape we have not checked.                                        */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Places returns LocalizedText objects: `{ text, languageCode }`. */
function localizedText(value: unknown): string | null {
  const record = asRecord(value);
  return record ? asString(record.text) : null;
}

/** `regularOpeningHours.weekdayDescriptions` — "Monday: 7:30 AM – 6:00 PM". */
function weekdayDescriptions(value: unknown): string[] {
  const hours = asRecord(value);
  const list = hours?.weekdayDescriptions;
  if (!Array.isArray(list)) return [];
  return list.filter((entry): entry is string => typeof entry === 'string');
}

/* --------------------------------- mapping -------------------------------- */

/**
 * Map one `places:searchText` response body to `PlaceFacts`.
 *
 * Throws when the response carries no usable place. Ground truth is the axis
 * the whole audit is scored against — a fabricated placeholder here would
 * silently corrupt every downstream verdict, so we fail loudly instead.
 */
export function mapPlaceResponse(body: unknown): PlaceFacts {
  const root = asRecord(body);
  const places = root?.places;
  if (!Array.isArray(places) || places.length === 0) {
    throw new Error('places: no match for that name and city');
  }

  const place = asRecord(places[0]);
  const placeId = asString(place?.id);
  const name = localizedText(place?.displayName);
  if (!place || !placeId || !name) {
    throw new Error('places: first result is missing id or displayName');
  }

  return {
    place_id: placeId,
    name,
    category: localizedText(place.primaryTypeDisplayName),
    address: asString(place.formattedAddress),
    phone: asString(place.nationalPhoneNumber),
    website: asString(place.websiteUri),
    rating: asNumber(place.rating),
    rating_count: asNumber(place.userRatingCount),
    hours: weekdayDescriptions(place.regularOpeningHours),
  };
}

/* ---------------------------------- fetch --------------------------------- */

/**
 * One paid Places call. The caller owns `assertBudget` / `recordSpend` around
 * this — the ledger belongs to the agent, not to the transport.
 */
export async function fetchPlaceFacts(
  env: Env,
  name: string,
  city: string,
): Promise<PlaceFacts> {
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error('places: GOOGLE_PLACES_API_KEY is not configured');
  }

  const response = await fetch(PLACES_ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `${name} ${city}`, maxResultCount: 1 }),
  });

  if (!response.ok) {
    const detail = await response.text();
    // An upstream error body can echo request context back at us, and this
    // throw escapes the agent. Redact at the throw site so the control does
    // not depend on every future caller remembering to apply it.
    throw new Error(`places: HTTP ${response.status} ${redact(detail).slice(0, 300)}`);
  }

  return mapPlaceResponse(await response.json());
}

/** Ground truth rendered for a model. Callers still wrap it as untrusted. */
export function factsToText(facts: PlaceFacts): string {
  const lines = [
    `name: ${facts.name}`,
    `category: ${facts.category ?? '(unknown)'}`,
    `address: ${facts.address ?? '(unknown)'}`,
    `phone: ${facts.phone ?? '(unknown)'}`,
    `website: ${facts.website ?? '(unknown)'}`,
    `rating: ${facts.rating ?? '(unknown)'} from ${facts.rating_count ?? 0} ratings`,
    `hours: ${facts.hours.length > 0 ? facts.hours.join(' | ') : '(unknown)'}`,
  ];
  return lines.join('\n');
}
