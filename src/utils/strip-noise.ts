/**
 * Strip fields that are noise for an AI agent from a tool payload.
 *
 * Jira's REST responses carry a lot of material that only a web UI can use:
 * API self-links, avatar and icon URLs. Repeated across every issue in a
 * search result they can be the majority of the bytes an agent has to read,
 * and none of it can be fed back into another tool call.
 *
 * Removal happens here, at the single point every response passes through,
 * rather than in each of the ~25 tool files that build these objects. That
 * keeps the rule in one place and survives the next hand-sync of the tool
 * sources from the MCP server.
 */

/** Keys removed at any depth: UI-only links and images. */
const NOISE_KEYS = new Set([
  'self',
  'iconUrl',
  'avatarUrls',
  'avatarUrl',
  'epicSelf',
]);

/**
 * Personal data, removed unless the tool exists to look people up.
 *
 * `getUser` and `universalSearchUsers` are how a caller turns a name or an
 * email into an accountId, so the email is their actual payload; everywhere
 * else accountId plus displayName identifies a person without spreading their
 * address through issue and comment listings.
 */
const EMAIL_KEY = 'emailAddress';
const EMAIL_TOOLS = new Set(['getUser', 'universalSearchUsers']);

/**
 * Recursively drop noise keys.
 *
 * Returns the input unchanged for primitives, so callers can pass anything.
 */
export function stripNoise(value: unknown, toolName?: string): unknown {
  const keepEmail = toolName !== undefined && EMAIL_TOOLS.has(toolName);
  return walk(value, keepEmail);
}

function walk(value: unknown, keepEmail: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, keepEmail));
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (NOISE_KEYS.has(key)) continue;
    if (key === EMAIL_KEY && !keepEmail) continue;
    out[key] = walk(child, keepEmail);
  }
  return out;
}
