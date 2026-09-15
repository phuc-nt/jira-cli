---
name: jira-cli
description: Search, read, create, update, transition and comment on Jira Cloud issues, plus projects, boards, sprints, filters and dashboards, from the shell with the `jira-cli` command (Atlassian API token, no MCP needed). Use when the user asks about Jira tickets, issue status, sprints, backlog, or wants to create or change something in Jira.
---

# Jira via `jira-cli`

`jira-cli` is a shell command with 49 Jira Cloud tools, the same tools,
parameters and response shape as the Jira Cloud MCP server. Every call prints
one JSON envelope on stdout; nothing else goes there. Logs go to stderr. Use it
exactly as you would use the MCP tools of the same names.

**Never guess a tool name or a parameter name.** Unlike an MCP server, this CLI
does not push its tool list into your context — you have to ask for it, and the
answer is authoritative:

```bash
jira-cli tools --json        # every tool: name, summary, required[], optional[]
jira-cli describe <tool>     # one tool: full description + JSON Schema
```

Section 5 below maps tasks to tools. When that table is not enough, run
`describe` before calling — it costs one command and prevents an INVALID_INPUT
round trip.

## 1. Check the setup once per session

```bash
jira-cli doctor
```

- `ok: true` → `data.user.displayName` is the account you act as, `data.site`
  the site. Continue.
- exit 2 with `AUTH_FAILED` and "Missing credentials" → ask the user to set
  `ATLASSIAN_SITE_NAME`, `ATLASSIAN_USER_EMAIL`, `ATLASSIAN_API_TOKEN` in the
  environment or in a `.env` file in the working directory. Never ask the user
  to paste the token into the chat, and never print it.
- `command not found` → install: `npm install -g @phuc-nt/jira-cli`
  (or `npm install -g github:phuc-nt/jira-cli`), Node 20+.

## 2. Call a tool

```bash
jira-cli <tool> --key value --key2 value2      # flags, coerced to the schema type
jira-cli <tool> --json '{"key": "value"}'      # or one JSON object
jira-cli <tool> --file params.json              # or a file / --stdin
jira-cli describe <tool>                        # full description + JSON Schema
jira-cli tools                                  # all tools, one line each
```

Rules:
- Arrays: `--labels a,b` or `--issueKeys '["A-1","A-2"]'`. Objects
  (`customFields`, `visibility`) need `--json` or `--file`.
- Long `description`/`body` text → write it to a file and use `--file`. Do not
  fight shell quoting.
- Exit code: `0` success, `1` the tool returned `ok: false`, `2` wrong
  parameters or credentials. Always read `error.code` and `error.hint`.
- Unknown flag or wrong type is refused before any API call; run
  `describe <tool>` and retry. Do not guess parameter names.
- Tool descriptions are long; `describe` is the authority when the table in
  `reference/tools.md` is not enough.

## 3. Response envelope

```jsonc
{ "ok": true,  "data": { ... }, "meta": { "tool": "getIssue", ... } }
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "hint": "..." }, "meta": { "tool": "..." } }
```

Responses carry only what you can act on: self-links, icon and avatar URLs are
removed, and descriptions arrive as Markdown. A person is `accountId` plus
`displayName`; email addresses appear only in `getUser` and
`universalSearchUsers`, so use those when you need to match a person by email.

Codes: `AUTH_FAILED`, `PERMISSION_DENIED`, `INVALID_INPUT`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `NETWORK_ERROR`, `UNKNOWN_ERROR`.
On `INVALID_INPUT` from Jira itself (bad JQL, unknown field, missing screen
field): fix the request from `error.message`, retry once. On `RATE_LIMITED`:
wait, then retry once. On `AUTH_FAILED` or `PERMISSION_DENIED`: stop and
report; do not retry.

## 4. Workflows

Orientation:
```bash
jira-cli listProjects                                   # data.projects[].key
jira-cli getProject --projectKey PROJ
jira-cli universalSearchUsers --query "name or email"   # accountId for assignee fields
```

Search (JQL must be bounded — always include a project, assignee, key or date):
```bash
jira-cli enhancedSearchIssues --projectKey PROJ --status "In Progress" --maxResults 20
jira-cli enhancedSearchIssues --jql 'project = PROJ AND updated >= -7d ORDER BY updated DESC' --maxResults 50
jira-cli enhancedSearchIssues --quickFilter my-issues
jira-cli enhancedSearchIssues --projectKey PROJ --fields summary,status,assignee --nextPageToken "<data.nextPageToken of the previous page>"
```

Read one issue:
```bash
jira-cli getIssue --issueKey PROJ-123                    # auto-expands by type (Epic/Story/Sub-task)
jira-cli getIssue --issueKey PROJ-123 --includeComments --includeTransitions
jira-cli getIssueComments --issueKey PROJ-123
```

Create and update:
```bash
jira-cli createIssue --projectKey PROJ --summary "Login fails on Safari" --issueType Bug --file body.json
# body.json: {"description": "Steps...\n1. ...", "labels": ["frontend"], "priority": "High"}
jira-cli createIssue --projectKey PROJ --summary "Auth epic" --epicName "Auth"          # Epic
jira-cli createIssue --projectKey PROJ --summary "Story" --epicKey PROJ-10             # Story under Epic
jira-cli createIssue --projectKey PROJ --summary "Sub" --parentKey PROJ-11             # Sub-task
jira-cli updateIssue --issueKey PROJ-123 --summary "New summary" --labels a,b
jira-cli assignIssue --issueIdOrKey PROJ-123 --accountId <accountId>                  # omit accountId to unassign
```

Move through the workflow (transition IDs are per project; always look them up first):
```bash
jira-cli getIssueTransitions --issueKey PROJ-123        # pick data.transitions[].id by name
jira-cli transitionIssue --issueIdOrKey PROJ-123 --transitionId 31 --comment "Done in PR #42"
```

Comments:
```bash
jira-cli addIssueComment --issueKey PROJ-123 --body "Reviewed, see notes."
jira-cli updateIssueComment --issueKey PROJ-123 --commentId 10045 --body "Edited"
```

Boards and sprints:
```bash
jira-cli listBoards --projectKeyOrId PROJ
jira-cli listSprints --boardId 12 --state active
jira-cli getSprintIssues --sprintId 345 --fields summary,status,assignee
jira-cli addIssueToSprint --sprintId 345 --issueKeys PROJ-1,PROJ-2
jira-cli addIssuesToBacklog --issueKeys PROJ-3
```

Filters, dashboards, fix versions follow the same pattern; see
`reference/tools.md` for their parameters.

Before `createIssue`, `updateIssue`, `transitionIssue`, `assignIssue`,
`deleteIssue`, sprint changes, or anything that writes to Jira, state what will
change (issue key, fields, new values) and get the user's confirmation. Read
tools (`get*`, `list*`, `*Search*`) need no confirmation. Never bulk-write
across issues the user did not name or filter explicitly.

## 5. Picking the right tool

Parameter tables for all 49 tools: [reference/tools.md](reference/tools.md).
When a table is not enough, `jira-cli describe <tool>` is authoritative.

Start from the task, not from the tool name:

| The user wants | Tool |
|---|---|
| Find issues by anything (project, status, assignee, JQL, text) | `enhancedSearchIssues` — the only search tool; there is no `listIssues` |
| Everything about one issue | `getIssue` (add `--includeComments`, `--includeTransitions`, `--includeHierarchy`) |
| Only the comments / only the transitions | `getIssueComments` / `getIssueTransitions` |
| Create anything: task, bug, story, epic, sub-task | `createIssue` — one tool, the type is detected from the parameters |
| Change fields on an issue | `updateIssue` |
| Move an issue through the workflow | `getIssueTransitions`, then `transitionIssue` |
| Find a person's accountId | `universalSearchUsers` (or `getUser` when the accountId is known) |
| What is on a board / in the backlog | `getBoardIssues` |
| What is in a sprint | `getSprintIssues` |
| Finish a sprint normally | `closeSprint` — NOT `deleteSprint` |
| Undo a sprint created by mistake | `deleteSprint` (future or closed only; active is refused) |
| Retire a release | `updateFixVersion --released true` — NOT `deleteFixVersion` |

Pairs that are easy to confuse:

- `getSprintIssues` reports **0 issues on team-managed (next-gen) boards** even
  when the sprint has issues — Jira's own agile endpoint behaves that way. To
  see a next-gen sprint's contents, use
  `enhancedSearchIssues --jql 'sprint = <id>'`.
- `closeSprint` ends a sprint and keeps its history; `deleteSprint` erases it
  from burndown and velocity. Default to `closeSprint`.
- `removeGadgetFromDashboard` removes one gadget; `deleteDashboard` removes the
  whole dashboard for everyone it was shared with.
- `updateFixVersion` (released/archived) keeps release history;
  `deleteFixVersion` removes the version and, without `moveFixIssuesTo`, strips
  it from every issue that carried it.
- `updateIssueComment` takes the comment's **current** version internally — do
  not pre-increment it.

## 5b. Destructive tools

`deleteIssue`, `deleteSprint`, `deleteDashboard`, `deleteFixVersion` and
`deleteFilter` are irreversible and none of them has an undo. Before calling
any of them:

1. Name the exact object (key, id **and** its name/summary) and what else it
   takes with it — a dashboard's gadgets, a sprint's history, a version's links
   on every issue that carries it.
2. Get the user's explicit confirmation for that object.
3. Prefer the non-destructive alternative in the table above when it fits.

Never delete objects the user did not name, never delete in a loop over search
results, and never delete to "clean up" something you created unless the user
asked for that.

## 6. When MCP becomes available

The MCP server (`mcp-jira-cloud-server`) registers the same tool names,
parameters and envelope. Switch the transport; keep the workflow above as is.
