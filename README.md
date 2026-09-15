# jira-cli

Jira Cloud from the shell, built for AI agent harnesses that cannot load MCP servers (and for scripts). One command, 49 tools covering issues, search, projects, users, boards, sprints, filters, dashboards and fix versions, one JSON envelope, authenticated with a personal Atlassian API token. Ships with an agent skill so Claude Code, Kiro and similar tools know when and how to use it.

The tool names, parameters and response envelope are the same as the [Jira Cloud MCP server](https://github.com/phuc-nt/jira-cloud-mcp-server), so a workflow written against the CLI moves to MCP without changes.

## Install

Node.js 20 or newer.

```bash
npm install -g @phuc-nt/jira-cli
# or straight from GitHub
npm install -g github:phuc-nt/jira-cli
```

## Credentials

Create an API token at <https://id.atlassian.com/manage-profile/security/api-tokens>, then set three variables in the environment or in a `.env` file in the working directory:

| Variable | Value |
|---|---|
| `ATLASSIAN_SITE_NAME` | `your-site.atlassian.net` (or just `your-site`) |
| `ATLASSIAN_USER_EMAIL` | the account email |
| `ATLASSIAN_API_TOKEN` | the API token |

```bash
jira-cli doctor            # live check: prints the acting account, the site and the tool count
```

## Usage

```bash
jira-cli tools                                        # every tool, one line each
jira-cli describe enhancedSearchIssues                # full description + JSON Schema
jira-cli enhancedSearchIssues --projectKey PROJ --status "In Progress" --maxResults 20
jira-cli getIssue --issueKey PROJ-123 --includeComments
jira-cli createIssue --projectKey PROJ --summary "Login fails on Safari" --file body.json   # {"description": "..."}
jira-cli transitionIssue --json '{"issueIdOrKey":"PROJ-123","transitionId":"31"}'
echo '{"quickFilter":"my-issues","maxResults":10}' | jira-cli enhancedSearchIssues --stdin
```

Parameters can be given as flags (`--key value`, `--key=value`, `--flag`, `--labels a,b`), as one JSON object (`--json '{...}'`, `--file params.json`, `--stdin`), or mixed. Flags are coerced to the type the tool's schema declares. JQL must be bounded (project, assignee, key or date); Jira Cloud rejects unbounded queries.

Responses are written for an agent to read: API self-links, icon and avatar URLs are stripped at every level, issue descriptions are rendered from Jira's ADF to Markdown, and email addresses are returned only by `getUser` and `universalSearchUsers`, the two tools whose job is to look people up. Elsewhere a person is `accountId` plus `displayName`.

Every call prints exactly one envelope on stdout. Logs go to stderr only (`LOG_LEVEL=debug|info|warn|error`, default `warn`).

```jsonc
{ "ok": true,  "data": { ... }, "meta": { "tool": "getIssue" } }
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "hint": "..." }, "meta": { "tool": "getIssue" } }
```

| Exit code | Meaning |
|---|---|
| `0` | the tool returned `ok: true` |
| `1` | the tool returned `ok: false` (see `error.code`, `error.hint`) |
| `2` | bad command, unknown or mistyped parameter, or missing credentials |

Error codes: `AUTH_FAILED`, `PERMISSION_DENIED`, `INVALID_INPUT`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `NETWORK_ERROR`, `UNKNOWN_ERROR`.

## Tools

| Area | Tools |
|---|---|
| Issues | `getIssue`, `createIssue`, `updateIssue`, `deleteIssue`, `assignIssue`, `getIssueTransitions`, `transitionIssue`, `getIssueComments`, `addIssueComment`, `updateIssueComment` |
| Search | `enhancedSearchIssues`, `universalSearchUsers`, `getUser` |
| Projects and versions | `listProjects`, `getProject`, `listProjectVersions`, `getProjectVersion`, `createFixVersion`, `updateFixVersion`, `deleteFixVersion` |
| Boards and sprints | `listBoards`, `getBoard`, `getBoardConfiguration`, `getBoardIssues`, `listSprints`, `getSprint`, `getSprintIssues`, `createSprint`, `startSprint`, `closeSprint`, `addIssueToSprint`, `deleteSprint`, `addIssuesToBacklog`, `rankBacklogIssues` |
| Filters | `listFilters`, `getFilter`, `getMyFilters`, `createFilter`, `updateFilter`, `deleteFilter` |
| Dashboards | `listDashboards`, `getDashboard`, `createDashboard`, `updateDashboard`, `getDashboardGadgets`, `getJiraGadgets`, `addGadgetToDashboard`, `removeGadgetFromDashboard`, `deleteDashboard` |

Exact names and parameter tables: [skills/jira-cli/reference/tools.md](skills/jira-cli/reference/tools.md). `jira-cli describe <tool>` is the authority.

## Agent skill

[`skills/jira-cli/`](skills/jira-cli/) follows the Agent Skills format (`SKILL.md` plus a generated reference). Copy it into the project the agent works in:

```bash
SRC="$(npm root -g)/@phuc-nt/jira-cli/skills/jira-cli"
cp -r "$SRC" .claude/skills/      # Claude Code
cp -r "$SRC" .kiro/skills/        # Kiro
```

The skill tells the agent to run `doctor` once, how to pass parameters, how to react to each error code, how to look up transition IDs before moving an issue, and to confirm with the user before writes.

## Development

```bash
npm install
npm run typecheck          # tsc, no emit
npm run build              # esbuild, one self-contained file under dist/
npm run cli -- doctor      # run the local build
npm run skill:reference    # regenerate skills/jira-cli/reference/tools.md from the built CLI
```

The tool implementations under `src/tools/` and `src/utils/` were copied from the Jira Cloud MCP server and are kept in sync by hand; this package has no dependency on the MCP server or the MCP SDK. The tools register through the small `ToolRegistrar` interface in `src/utils/tool-registrar.ts`, which mirrors the MCP server's `tool()` method.

## License

MIT, see [LICENSE](LICENSE).
