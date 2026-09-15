import { z } from 'zod';

/**
 * Jira's `fields`/`expand`-style params are historically comma-separated
 * strings (e.g. "summary,status") but are also natural to pass as arrays.
 * This schema accepts either shape so callers don't have to remember which
 * one a given tool expects.
 */
export const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

/** Normalize a `stringOrStringArray` value into an array of trimmed, non-empty entries. */
export function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parts = Array.isArray(value) ? value : value.split(',');
  const trimmed = parts.map((part) => part.trim()).filter((part) => part.length > 0);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Normalize a `stringOrStringArray` value into a comma-separated string, for query params that take CSV. */
export function toCommaString(value: string | string[] | undefined): string | undefined {
  const array = toArray(value);
  return array ? array.join(',') : undefined;
}
