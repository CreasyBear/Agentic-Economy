import type { ScanTarget } from '@/lib/ui/contract-scans'

export function cleanRuntimeTargets(): readonly ScanTarget[] {
  return [
    { root: 'src', includeExtensions: ['.ts', '.tsx'], exclude: ['src/lib/ui/contract-scans.ts'] },
    { root: 'convex', includeExtensions: ['.ts'] },
  ]
}

export function routeTargets(): readonly ScanTarget[] {
  return [{ root: 'src/routes', includeExtensions: ['.ts', '.tsx'] }]
}

export function fixtureTargets(root: string): readonly ScanTarget[] {
  return [{ root, includeExtensions: ['.fixture', '.ts', '.tsx'] }]
}

export function isFixtureMode(): boolean {
  return process.env.AE_SCAN_MODE === 'fixtures'
}
