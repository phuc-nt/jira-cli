/**
 * Shared MCP response envelope.
 *
 * Every tool in this server returns exactly one text block containing JSON in
 * one of two shapes:
 *
 *   success -> { ok: true,  data: {...}, meta: {...} }
 *   failure -> { ok: false, error: { code, message, hint? }, meta: {...} }
 *
 * The same contract is mirrored in the sibling Confluence and Slack MCP
 * servers so an AI client can parse any of the three the same way. Keep this
 * file in sync across those repos when the contract changes.
 */

import { stripNoise } from './strip-noise.js';

/** Stable, machine-readable error codes shared by all three MCP servers. */
export const ErrorCodes = {
  // Auth & permissions
  AUTH_FAILED: 'AUTH_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  // Request shape
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  // Upstream
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface EnvelopeMeta {
  /** Tool name, so multi-call transcripts stay attributable. */
  tool?: string;
  [key: string]: unknown;
}

/**
 * MCP tool result: a single text block plus the protocol-level error flag.
 *
 * The index signature keeps this structurally compatible with the SDK's
 * open-ended result type, which tool handlers must return.
 */
export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
  [key: string]: unknown;
}

function serialize(payload: unknown): McpToolResult['content'] {
  return [{ type: 'text', text: JSON.stringify(payload, null, 2) }];
}

/**
 * Build a success envelope.
 *
 * Data passes through `stripNoise` so UI-only fields (self-links, icon and
 * avatar URLs) and personal email addresses never reach the caller. See
 * strip-noise.ts for what is removed and why.
 */
export function ok(data: unknown, meta: EnvelopeMeta = {}): McpToolResult {
  return {
    content: serialize({
      ok: true,
      data: stripNoise(data, typeof meta.tool === 'string' ? meta.tool : undefined),
      meta,
    }),
    isError: false,
  };
}

/** Build a failure envelope. `hint` should tell the caller how to recover. */
export function fail(
  code: ErrorCode,
  message: string,
  hint?: string,
  meta: EnvelopeMeta = {}
): McpToolResult {
  return {
    content: serialize({
      ok: false,
      error: { code, message, ...(hint ? { hint } : {}) },
      meta,
    }),
    isError: true,
  };
}

/** Recovery hints keyed by envelope code. */
const DEFAULT_HINTS: Partial<Record<ErrorCode, string>> = {
  [ErrorCodes.AUTH_FAILED]:
    'Check ATLASSIAN_USER_EMAIL and ATLASSIAN_API_TOKEN. API tokens are created at id.atlassian.com/manage-profile/security/api-tokens.',
  [ErrorCodes.PERMISSION_DENIED]:
    'The authenticated user lacks permission for this project or issue. Check Jira project roles.',
  [ErrorCodes.NOT_FOUND]:
    'Verify the issue key, project key, board ID, or sprint ID exists and is visible to this user.',
  [ErrorCodes.INVALID_INPUT]:
    'Check the JQL syntax and required fields for this Jira resource.',
  [ErrorCodes.RATE_LIMITED]: 'Slow down and retry after a short delay.',
};

/** HTTP status -> envelope code, for errors carrying an Atlassian response. */
function codeFromStatus(status: number): ErrorCode | null {
  switch (status) {
    case 400:
      return ErrorCodes.INVALID_INPUT;
    case 401:
      return ErrorCodes.AUTH_FAILED;
    case 403:
      return ErrorCodes.PERMISSION_DENIED;
    case 404:
      return ErrorCodes.NOT_FOUND;
    case 409:
      return ErrorCodes.CONFLICT;
    case 429:
      return ErrorCodes.RATE_LIMITED;
    default:
      return status >= 500 ? ErrorCodes.UPSTREAM_ERROR : null;
  }
}

/**
 * Classify a free-text error message.
 *
 * Jira tools throw a mix of ApiError and plain Error, and the useful signal is
 * often only the HTTP status embedded in the message text
 * ("Jira API error: 404 ...").
 */
export function classifyErrorMessage(message: string): ErrorCode {
  const status = message.match(/\b(400|401|403|404|409|429|5\d{2})\b/);
  if (status) {
    const fromStatus = codeFromStatus(Number(status[1]));
    if (fromStatus) return fromStatus;
  }
  if (/unauthor|authentication|invalid credentials/i.test(message)) {
    return ErrorCodes.AUTH_FAILED;
  }
  if (/forbidden|permission|not permitted/i.test(message)) {
    return ErrorCodes.PERMISSION_DENIED;
  }
  if (
    /not found|does not exist|no such|cannot detect issue type/i.test(message)
  ) {
    return ErrorCodes.NOT_FOUND;
  }
  if (/rate limit|too many requests/i.test(message)) {
    return ErrorCodes.RATE_LIMITED;
  }
  if (/invalid|malformed|jql|required|expected/i.test(message)) {
    return ErrorCodes.INVALID_INPUT;
  }
  if (/econn|etimedout|enotfound|network|fetch failed/i.test(message)) {
    return ErrorCodes.NETWORK_ERROR;
  }
  return ErrorCodes.UNKNOWN_ERROR;
}

/** Build a failure envelope from an arbitrary thrown value. */
export function failFromError(
  error: unknown,
  meta: EnvelopeMeta = {}
): McpToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = (error as { statusCode?: number })?.statusCode;
  const code =
    (typeof statusCode === 'number' ? codeFromStatus(statusCode) : null) ??
    classifyErrorMessage(message);
  return fail(code, message, DEFAULT_HINTS[code], meta);
}

/**
 * Wrap a legacy tool result into the shared envelope.
 *
 * Tools in this server predate the envelope: each returns a single text block
 * holding a bare JSON payload, with `success: false` plus `isError: true` on
 * the failure path. Rather than editing 47 tool files, the registration
 * wrapper funnels every result through here, which:
 *
 *   - parses the text block back into an object,
 *   - splits the legacy `success` / `error` fields out of the payload,
 *   - re-emits the remainder as envelope `data`.
 *
 * A result that is already an envelope passes through untouched, so tools can
 * be migrated to call `ok()` / `fail()` directly without a flag day.
 */
export function toEnvelope(result: unknown, toolName: string): McpToolResult {
  const meta: EnvelopeMeta = { tool: toolName };

  const block = (result as McpToolResult)?.content?.[0];
  if (!block || block.type !== 'text') {
    // Nothing parseable; surface whatever came back as opaque data.
    return ok(result ?? null, meta);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(block.text);
  } catch {
    // Non-JSON text block: keep the text intact rather than losing it.
    return ok({ text: block.text }, meta);
  }

  if (payload && typeof payload === 'object' && 'ok' in (payload as object)) {
    return result as McpToolResult; // already an envelope
  }

  const isError = (result as McpToolResult).isError === true;
  const record = (payload ?? {}) as Record<string, unknown>;
  const { success, error, ...data } = record;

  if (isError || success === false) {
    const message =
      typeof error === 'string' && error
        ? error
        : 'Jira tool reported failure without an error message';
    const code = classifyErrorMessage(message);
    return fail(code, message, DEFAULT_HINTS[code], meta);
  }

  return ok(data, meta);
}
