import { z } from 'zod';
import type { ToolRegistrar } from '../../utils/tool-registrar.js';
import { deleteFixVersion } from '../../utils/jira-tool-api-v3.js';
import { Logger } from '../../utils/logger.js';
import { Config } from '../../utils/mcp-helpers.js';

const logger = Logger.getLogger('JiraTools:deleteFixVersion');

export const deleteFixVersionSchema = z.object({
  versionId: z.string().describe('Version ID to delete (e.g., 10100). Get it from listProjectVersions.'),
  moveFixIssuesTo: z.string().optional().describe('Version ID to move the issues\' fixVersions to. Omit and those issues simply lose the version.'),
  moveAffectedIssuesTo: z.string().optional().describe('Version ID to move the issues\' affectedVersion to. Omit and those issues simply lose the version.')
});

type DeleteFixVersionParams = z.infer<typeof deleteFixVersionSchema>;

async function deleteFixVersionToolImpl(params: DeleteFixVersionParams, context: any) {
  const config = Config.getConfigFromContextOrEnv(context);
  logger.info(`Deleting version ID: ${params.versionId}`);
  await deleteFixVersion(config, params.versionId, {
    moveFixIssuesTo: params.moveFixIssuesTo,
    moveAffectedIssuesTo: params.moveAffectedIssuesTo
  });
  return {
    success: true,
    versionId: params.versionId,
    movedFixIssuesTo: params.moveFixIssuesTo ?? null,
    movedAffectedIssuesTo: params.moveAffectedIssuesTo ?? null
  };
}

export const registerDeleteFixVersionTool = (server: ToolRegistrar) => {
  server.tool(
    'deleteFixVersion',
    `Delete a Fix Version (release) from a project (DELETE /rest/api/3/version/{versionId}).

IRREVERSIBLE. Confirm with the user before calling.

Issues are NOT deleted, but every issue carrying this version loses it unless a
replacement is named: moveFixIssuesTo takes over the fixVersions field,
moveAffectedIssuesTo the affectedVersion field. Jira applies these server-side;
the move path has not been exercised against an issue that actually carried a
version, so verify the result with getProjectVersion rather than assuming the
link moved. Check getProjectVersion first too — its issue counts tell you
whether any issue is about to lose the link.

To retire a version without deleting it, prefer updateFixVersion with
released: true or archived: true; the history stays intact that way.

Requires Administer Projects permission on the project; otherwise the call
comes back PERMISSION_DENIED.`,
    deleteFixVersionSchema.shape,
    async (params: DeleteFixVersionParams, context: Record<string, any>) => {
      try {
        const result = await deleteFixVersionToolImpl(params, context);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        logger.error('Error in deleteFixVersion:', error);
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
