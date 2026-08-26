import type { CliOptions } from '../lib/args'
import { CliFailure, printJson } from '../lib/output'

const OWNER_CREDIT_PATH = '/owner/credit'

/** Continue owner funding in the authenticated browser surface; this command never performs funding. */
export async function runFundCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length > 0) {
    throw new CliFailure('Usage: npm run -s ae -- fund', {
      kind: 'INVALID_ARGUMENT',
      code: 'fund-usage',
    })
  }

  printJson({
    kind: 'continuation',
    command: 'fund',
    surface: 'owner_browser',
    authentication: 'owner_session',
    method: 'open',
    path: OWNER_CREDIT_PATH,
    anchor: '#fund',
    url: new URL(`${OWNER_CREDIT_PATH}#fund`, options.baseUrl).toString(),
    agentCredential: 'not_used',
    instruction: 'Open this continuation as the owner to add assistant credit; the CLI does not fund an owner account.',
  })
}
