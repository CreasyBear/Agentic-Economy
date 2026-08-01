import { parseArgs } from 'node:util'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { runEngineEvalSuite } from './lib/suite'

const outputPath = resolve(readOutputPath())
const report = await runEngineEvalSuite()
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log([
  `engine eval suite: ${report.ok ? 'passed' : 'failed'}`,
  `cases=${report.summary.caseCount}`,
  `failedCases=${report.summary.failedCaseCount}`,
  `planSuccessRate=${report.summary.planSuccessRate}`,
  `modelCalls=${report.summary.modelCallCount}`,
  `p95WallMs=${report.summary.p95WallMs}`,
  `report=${outputPath}`,
].join(' '))

if (!report.ok) process.exit(1)

function readOutputPath(): string {
  const { values } = parseArgs({ options: { output: { type: 'string' } }, strict: false })
  return typeof values.output === 'string' ? values.output : 'output/eval/engine-suite-report.json'
}
