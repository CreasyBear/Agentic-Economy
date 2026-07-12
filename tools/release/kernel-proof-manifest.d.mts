export const PROOF_MANIFEST_VERSION: 'ae-kernel-proof-manifest:v1'
export const HTTP_OPERATIONS: readonly string[]
export const MCP_TOOLS: readonly string[]
export const REQUIRED_OUTCOMES: readonly string[]

export function verifyKernelProofManifest(
  manifest: unknown,
  expectedRevision: string,
): { ok: boolean; errors: string[] }

export function readExpectedRevision(env?: NodeJS.ProcessEnv): string
export function readManifest(env?: NodeJS.ProcessEnv, argv?: readonly string[]): unknown
