import { z } from 'zod';
import type { ToolRegistrar } from '../../utils/tool-registrar.js';
import { deleteSprint } from '../../utils/jira-tool-api-agile.js';
import { Logger } from '../../utils/logger.js';
import { Config } from '../../utils/mcp-helpers.js';

const logger = Logger.getLogger('JiraTools:deleteSprint');

export const deleteSprintSchema = z.object({
  sprintId: z.string().describe('Sprint ID to delete (e.g., 34). Get it from listSprints.')
});

type DeleteSprintParams = z.infer<typeof deleteSprintSchema>;

async function deleteSprintToolImpl(params: DeleteSprintParams, context: any) {
  const config = Config.getConfigFromContextOrEnv(context);
  logger.info(`Deleting sprint with ID: ${params.sprintId}`);
  await deleteSprint(config, params.sprintId);
  return {
    success: true,
    sprintId: params.sprintId
  };
}

export const registerDeleteSprintTool = (server: ToolRegistrar) => {
  server.tool(
    'deleteSprint',
    `Delete a Jira sprint permanently (DELETE /rest/agile/1.0/sprint/{sprintId}).

IRREVERSIBLE, and it erases the sprint's history: burndown and velocity lose
that data point. Confirm with the user before calling.

Issues are NOT deleted — they go back to the backlog.

WARNING, verified against Jira Cloud: an ACTIVE sprint is deleted without any
objection. Jira does not protect the sprint the team is currently working in,
and there is no undo. Always read the sprint's state with getSprint before
calling, and say the state out loud to the user when asking for confirmation.

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
