import { withTemporaryClerkAcceptanceCredentials } from './customer-request-production-credential'

export const WORK_TREE_SCOPES = [
  'customer_requests:create',
  'customer_requests:approve_each',
  'work_trees:create',
  'work_trees:inspect',
  'work_trees:apply',
  'work_trees:decide',
] as const

export type WorkTreeTemporaryCredential = Readonly<{
  agentApiKey: string
  credentialId: string
  scopes: readonly string[]
  issueCustomerSessionToken: () => Promise<string>
}>

/**
 * Creates the least temporary identity that can cross the four WorkTree action
 * seams, then always revokes it through the existing Clerk credential helper.
 */
export async function withTemporaryWorkTreeCredential(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  fetch: typeof globalThis.fetch
  run: (credential: WorkTreeTemporaryCredential) => Promise<void>
  keyNamePrefix?: string
  revocationReason?: string
}>): Promise<void> {
  await withTemporaryClerkAcceptanceCredentials({
    clerkSecretKey: input.clerkSecretKey,
    expectedInstanceId: input.expectedInstanceId,
    subject: input.subject,
    scopes: WORK_TREE_SCOPES,
    fetch: input.fetch,
    keyNamePrefix: input.keyNamePrefix ?? 'AE hosted WorkTree parity',
    revocationReason: input.revocationReason ?? 'T51 hosted WorkTree parity completed',
    run: async ({ agentApiKey, credentialId, issueCustomerSessionToken }) => {
      await input.run({
        agentApiKey,
        issueCustomerSessionToken,
        credentialId,
        scopes: WORK_TREE_SCOPES,
      })
    },
  })
}
