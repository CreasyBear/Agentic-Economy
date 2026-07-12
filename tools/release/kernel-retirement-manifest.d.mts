export const KERNEL_RETIREMENT_MANIFEST_VERSION: 'ae-kernel-retirement:v1'

export const kernelRetirementManifest: Readonly<{
  schemaVersion: typeof KERNEL_RETIREMENT_MANIFEST_VERSION
  retired: Readonly<{
    files: readonly string[]
    routes: readonly string[]
    tables: readonly string[]
    jobs: readonly string[]
    environmentKeys: readonly string[]
    importTokens: readonly string[]
  }>
  retainedNonAuthority: readonly Readonly<{ domain: string; roots: readonly string[] }>[]
}>
