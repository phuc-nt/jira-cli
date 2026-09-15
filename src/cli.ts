/**
 * Command-line front end over the same tools the full MCP server exposes.
 *
 * For harnesses that cannot load MCP servers: each invocation runs one tool
 * and prints the same {ok, data, meta} envelope the server would return, so a
 * skill written against the CLI keeps working unchanged once MCP is available.
 */
import dotenv from 'dotenv';
import { createRequire } from 'module';
import { Logger, LogLevel } from './utils/logger.js';
import { registerAllTools } from './tools/index.js';
import { AtlassianConfig, createBasicHeaders, normalizeAtlassianBaseUrl } from './utils/atlassian-api-base.js';
import { ok, fail, failFromError, toEnvelope, ErrorCodes, McpToolResult } from './utils/response-envelope.js';
import { ToolCollector, CollectedTool } from './cli/tool-collector.js';
import { runCli, CliAdapter } from './cli/runner.js';

dotenv.config();
// A CLI call is one tool; the server's per-request info lines are noise here.
if (!process.env.LOG_LEVEL) Logger.setLogLevel(LogLevel.WARN);
// Dependency deprecation notices are for library authors, not for whoever
// reads this CLI's stderr.
(process as unknown as { noDeprecation: boolean }).noDeprecation = true;

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };
const BIN = 'jira-cli';
const ENV_NAMES = ['ATLASSIAN_SITE_NAME', 'ATLASSIAN_USER_EMAIL', 'ATLASSIAN_API_TOKEN'] as const;

const missing = ENV_NAMES.filter((name) => !process.env[name]?.trim());
const config: AtlassianConfig | null = missing.length
  ? null
  : {
      baseUrl: normalizeAtlassianBaseUrl(process.env.ATLASSIAN_SITE_NAME!.trim()),
      email: process.env.ATLASSIAN_USER_EMAIL!.trim(),
      apiToken: process.env.ATLASSIAN_API_TOKEN!.trim(),
    };

// Tools read credentials from the per-call context, so registration itself
// needs none; `tools` and `describe` therefore work before setup is finished.
const collector = new ToolCollector();
registerAllTools(collector);

const adapter: CliAdapter = {
  binName: BIN,
  version: packageJson.version,
  credentialHelp: ENV_NAMES.join(', '),
  tools: collector.list(),

  credentialError(): McpToolResult | null {
    if (config) return null;
    return fail(
      ErrorCodes.AUTH_FAILED,
      `Missing credentials: ${missing.join(', ')}`,
      'Set them in the environment or a .env file in the current directory, then run "jira-cli doctor".',
      { tool: 'credentials' }
    );
  },

  async doctor(): Promise<McpToolResult> {
    try {
      const response = await fetch(`${config!.baseUrl}/rest/api/3/myself`, {
        headers: createBasicHeaders(config!.email, config!.apiToken),
        credentials: 'omit',
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 300);
        throw Object.assign(new Error(`Jira API error: ${response.status} ${body}`), { statusCode: response.status });
      }
      const me = (await response.json()) as Record<string, unknown>;
      return ok(
        {
          site: config!.baseUrl,
          email: config!.email,
          user: {
            accountId: me.accountId,
            displayName: me.displayName,
            emailAddress: me.emailAddress ?? null,
            active: me.active,
            timeZone: me.timeZone ?? null,
          },
          credentialSources: { siteName: ENV_NAMES[0], email: ENV_NAMES[1], apiToken: ENV_NAMES[2] },
          toolCount: collector.list().length,
        },
        { tool: 'doctor' }
      );
    } catch (error) {
      return failFromError(error, { tool: 'doctor' });
    }
  },

  // Same wrapper as the server: inject credentials, normalise legacy results
  // into the envelope, and never let a throw escape without one.
  async invoke(tool: CollectedTool, params: Record<string, unknown>): Promise<McpToolResult> {
    try {
      return toEnvelope(await tool.handler(params, { atlassianConfig: config }), tool.name);
    } catch (error) {
      return failFromError(error, { tool: tool.name });
    }
  },
};

runCli(process.argv.slice(2), adapter).then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`[${BIN}] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(2);
  }
);
