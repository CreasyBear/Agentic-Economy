import type { CliOptions } from '../lib/args'
import { CliFailure, printJson } from '../lib/output'

const OWNER_ACCESS_PATH = '/agent-access'

/** Continue owner revocation in the authenticated browser surface; this command never revokes access. */
export async function runRevokeCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length > 0) {
    throw new CliFailure('Usage: npm run -s ae -- revoke', {
      kind: 'INVALID_ARGUMENT',
      code: 'revoke-usage',
    })
  }

  printJson({
    kind: 'continuation',
    command: 'revoke',
    surface: 'owner_browser',
    authentication: 'owner_session',
    method: 'open',
    path: OWNER_ACCESS_PATH,
    anchor: '#revoke',
    url: new URL(`${OWNER_ACCESS_PATH}#revoke`, options.baseUrl).toString(),
    agentCredential: 'not_used',
    instruction: 'Open this continuation as the owner to revoke assistant access; the CLI does not revoke owner authority.',
  })
}
