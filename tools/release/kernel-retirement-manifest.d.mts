export const KERNEL_RETIREMENT_MANIFEST_VERSION: 'ae-kernel-retirement:v2'

export const kernelRetirementManifest: Readonly<{
  schemaVersion: typeof KERNEL_RETIREMENT_MANIFEST_VERSION
  retainedHistoricalSurfaces: Readonly<{
    ingressRetirement: string
    historicalReadback: string
    historicalSchema: string
  }>
  retired: Readonly<{
    files: readonly string[]
    routes: readonly string[]
    quarantinedReadOnlyTables: readonly string[]
    jobs: readonly string[]
    environmentKeys: readonly string[]
    importTokens: readonly string[]
    dataVerification: string
  }>
  retainedNonAuthority: readonly Readonly<{ domain: string; roots: readonly string[] }>[]
}>
