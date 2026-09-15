import { z } from 'zod';
import type { ToolRegistrar } from '../../utils/tool-registrar.js';
import { deleteDashboard } from '../../utils/jira-tool-api-v3.js';
import { Logger } from '../../utils/logger.js';
import { Config } from '../../utils/mcp-helpers.js';

const logger = Logger.getLogger('JiraTools:deleteDashboard');

export const deleteDashboardSchema = z.object({
  dashboardId: z.string().describe('Dashboard ID to delete (e.g., 10001). Get it from listDashboards.')
});

type DeleteDashboardParams = z.infer<typeof deleteDashboardSchema>;

async function deleteDashboardToolImpl(params: DeleteDashboardParams, context: any) {
  const config = Config.getConfigFromContextOrEnv(context);
  logger.info(`Deleting dashboard with ID: ${params.dashboardId}`);
  await deleteDashboard(config, params.dashboardId);
  return {
    success: true,
    dashboardId: params.dashboardId
  };
}

export const registerDeleteDashboardTool = (server: ToolRegistrar) => {
  server.tool(
    'deleteDashboard',
    `Delete a Jira dashboard permanently (DELETE /rest/api/3/dashboard/{dashboardId}).

IRREVERSIBLE. The dashboard disappears for every user it was shared with, along
with its gadget layout. Confirm with the user before calling.

Requires ownership of the dashboard, or Jira admin rights; otherwise the call
comes back PERMISSION_DENIED.

To remove a single gadget instead of the whole dashboard, use
removeGadgetFromDashboard. To find the id, use listDashboards.`,
    deleteDashboardSchema.shape,
    async (params: DeleteDashboardParams, context: Record<string, any>) => {
      try {
        const result = await deleteDashboardToolImpl(params, context);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        logger.error('Error in deleteDashboard:', error);
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
