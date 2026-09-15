import { z } from 'zod';
import type { ToolRegistrar } from '../../utils/tool-registrar.js';
import { AtlassianConfig, createBasicHeaders, normalizeAtlassianBaseUrl } from '../../utils/atlassian-api-base.js';
import { ApiError, ApiErrorType } from '../../utils/error-handler.js';
import { Logger } from '../../utils/logger.js';
import { Config } from '../../utils/mcp-helpers.js';

// Initialize logger
const logger = Logger.getLogger('JiraTools:listIssues');

// Input parameter schema
export const listIssuesSchema = z.object({
  projectKey: z.string().optional().describe('Filter by project key (e.g., PROJ)'),
  assigneeId: z.string().optional().describe('Filter by assignee account ID'),
  status: z.string().optional().describe('Filter by issue status (e.g., Open, In Progress, Done)'),
  limit: z.number().default(50).describe('Maximum number of issues to return (default: 50)')
});

type ListIssuesParams = z.infer<typeof listIssuesSchema>;

async function listIssuesImpl(params: ListIssuesParams, context: any) {
  const config: AtlassianConfig = Config.getConfigFromContextOrEnv(context);
  logger.info(`Listing issues with filters:`, params);

  try {
    const headers = createBasicHeaders(config.email, config.apiToken);
    const baseUrl = normalizeAtlassianBaseUrl(config.baseUrl);

    // Build JQL query based on parameters
    const jqlParts: string[] = [];
    
    if (params.projectKey) {
      jqlParts.push(`project = "${params.projectKey}"`);
    }
    
    if (params.assigneeId) {
      jqlParts.push(`assignee = "${params.assigneeId}"`);
    }
    
    if (params.status) {
      jqlParts.push(`status = "${params.status}"`);
    }

    const jql = jqlParts.length > 0 ? jqlParts.join(' AND ') : '';

    // /rest/api/3/search was removed by Atlassian (CHANGE-2046); the
    // replacement takes the query in a POST body and pages by token.
    const requestBody = {
      jql,
      fields: ['key', 'summary', 'status', 'assignee', 'priority', 'created', 'updated', 'issuetype', 'project'],
      maxResults: params.limit
    };

    const url = `${baseUrl}/rest/api/3/search/jql`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const responseText = await response.text();
      logger.error(`Jira API error (search, ${response.status}):`, responseText);
      throw new ApiError(ApiErrorType.SERVER_ERROR, `Jira API error: ${response.status} ${responseText}`, response.status);
    }

    const result = await response.json();

    // Format response for better readability
    const formattedIssues = (result.issues || []).map((issue: any) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name,
      assignee: issue.fields.assignee?.displayName || 'Unassigned',
      priority: issue.fields.priority?.name,
      issueType: issue.fields.issuetype?.name,
      project: issue.fields.project?.key,
      created: issue.fields.created,
      updated: issue.fields.updated
    }));

    return {
      issues: formattedIssues,
      total: formattedIssues.length,
      maxResults: result.maxResults ?? params.limit,
      nextPageToken: result.nextPageToken,
      isLast: result.isLast,
      jql: jql || 'all issues',
      success: true
    };

  } catch (error) {
    logger.error('Error listing issues:', error);
    throw error;
  }
}

export const registerListIssuesTool = (server: ToolRegistrar) => {
  server.tool(
    'listIssues',
    'List Jira issues with optional filtering by project, assignee, and status',
    listIssuesSchema.shape,
    // Returning the bare result and letting errors propagate puts this tool on
    // the same envelope path as every other one, so it gets the shared error
    // codes and the response filtering instead of a hand-rolled wrapper.
    async (params: ListIssuesParams, context: Record<string, any>) => {
      const result = await listIssuesImpl(params, context);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );
};