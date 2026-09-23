import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { findFiles, type ScanTarget, type ScanViolation } from './file-discovery'

export type RouteControllerSizeMeasurement = {
  file: string
  lineCount: number
}

export type RouteControllerSizeViolation = ScanViolation & {
  actualLines: number
}

export type RouteControllerSizeScanResult = {
  measurements: readonly RouteControllerSizeMeasurement[]
  violations: readonly RouteControllerSizeViolation[]
}

export function scanRouteControllerSizes(
  targets: readonly ScanTarget[],
  maxLines: number,
): RouteControllerSizeScanResult {
  const measurements = findFiles(targets).map((file) => {
    const normalizedFile = relative(process.cwd(), file).replaceAll('\\', '/')
    return {
      file: normalizedFile,
      lineCount: readFileSync(file, 'utf8').split('\n').length,
    }
  })

  return {
    measurements,
    violations: measurements
      .filter(({ lineCount }) => lineCount > maxLines)
      .map(({ file, lineCount }) => ({
        file,
        line: 1,
        rule: 'route-controller-size',
        message: `${file} has ${lineCount} lines; maximum is ${maxLines}`,
        excerpt: `${lineCount} lines`,
        actualLines: lineCount,
      })),
  }
}
