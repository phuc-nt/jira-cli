import { z } from 'zod';
import type { ToolRegistrar } from '../../utils/tool-registrar.js';
import { deleteSprint } from '../../utils/jira-tool-api-agile.js';
import { Logger } from '../../utils/logger.js';
import { Config } from '../../utils/mcp-helpers.js';

const logger = Logger.getLogger('JiraTools:deleteSprint');

export const deleteSprintSchema = z.object({
  sprintId: z.string().describe('Sprint ID to delete (e.g., 34). Get it from listSprints.'),
  force: z
    .boolean()
    .optional()
    .describe(
      'Allow deleting an ACTIVE sprint. Without it an active sprint is refused with CONFLICT. Only pass it after the user has confirmed that specific active sprint.'
    )
});

type DeleteSprintParams = z.infer<typeof deleteSprintSchema>;

async function deleteSprintToolImpl(params: DeleteSprintParams, context: any) {
  const config = Config.getConfigFromContextOrEnv(context);
  logger.info(`Deleting sprint with ID: ${params.sprintId}${params.force ? ' (forced)' : ''}`);
  await deleteSprint(config, params.sprintId, { force: params.force });
  return {
    success: true,
    sprintId: params.sprintId,
    forced: params.force === true
  };
}

export const registerDeleteSprintTool = (server: ToolRegistrar) => {
  server.tool(
    'deleteSprint',
    `Delete a Jira sprint permanently (DELETE /rest/agile/1.0/sprint/{sprintId}).

IRREVERSIBLE, and it erases the sprint's history: burndown and velocity lose
that data point. Confirm with the user before calling.

Issues are NOT deleted — they go back to the backlog.

ACTIVE sprints are refused with CONFLICT. Jira itself does not object — verified
against Jira Cloud, it deletes the sprint the team is working in without any
warning — so this tool reads the state first and blocks it. Passing force: true
deletes it anyway; only do that after telling the user the sprint is active and
getting their confirmation for that specific sprint.

Closing a sprint is the normal end of a sprint; deleting one is only for a
sprint created by mistake. If the user wants a sprint finished, use
closeSprint.

Board admin rights are required; otherwise the call comes back
PERMISSION_DENIED.`,
    deleteSprintSchema.shape,
    async (params: DeleteSprintParams, context: Record<string, any>) => {
      try {
        const result = await deleteSprintToolImpl(params, context);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        logger.error('Error in deleteSprint:', error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) })
            }
          ],
          isError: true
        };
      }
    }
  );
};
