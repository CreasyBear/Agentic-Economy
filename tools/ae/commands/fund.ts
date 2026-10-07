import type { CliOptions } from '../lib/args'
import { printJson } from '../lib/output'
import { usageFailure } from '../lib/help'

const OWNER_CREDIT_PATH = '/owner/credit'

/** Continue owner funding in the authenticated browser surface; this command never performs funding. */
export async function runFundCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length > 0) {
    throw usageFailure('fund', 'fund-usage')
  }

  printJson({
    kind: 'owner_handoff',
    command: 'fund',
    surface: 'owner_browser',
    authentication: 'owner_session',
    ownerHandoff: {
      actor: 'account_owner',
      reason: 'funding_required',
      destination: new URL(`${OWNER_CREDIT_PATH}#fund`, options.baseUrl).href,
    },
    agentCredential: 'not_used',
    instruction: 'Open this continuation as the owner to add assistant credit; the CLI does not fund an owner account.',
  })
}
