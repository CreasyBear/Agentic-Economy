import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { runAnswerEvalSuite } from '../lib/suite'

const outputPath = resolve(readOutputPath())
const report = await runAnswerEvalSuite()

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(
  [
    `answer eval suite: ${report.ok ? 'passed' : 'failed'}`,
    `cases=${report.summary.caseCount}`,
    `turns=${report.summary.totalTurnCount}`,
    `failedCases=${report.summary.failedCaseCount}`,
    `failedScoreCases=${report.summary.failedScoreCaseCount}`,
    `minScore=${report.summary.minimumCaseScore}/${report.summary.scoreThreshold}`,
    `avgScore=${report.summary.averageCaseScore}`,
    `p95TurnTimingMs=${report.summary.p95TurnTimingMs}`,
    `report=${outputPath}`,
  ].join(' '),
)

if (!report.ok) {
  for (const testCase of report.cases) {
    if (testCase.ok && testCase.score >= testCase.scoreThreshold) {
      continue
    }
    const lowScoreNotes = testCase.scoreBreakdown
      .filter((item) => !item.passed)
      .map((item) => `${item.label} ${item.score}/${item.max}: ${item.notes.join(' ')}`)
    console.error(
      `${testCase.id}: score=${testCase.score}/${testCase.scoreThreshold}; problems=${testCase.problems.join('; ') || 'none'}; ${lowScoreNotes.join('; ')}`,
    )
  }
  process.exit(1)
}

function readOutputPath(): string {
  const index = process.argv.findIndex((arg) => arg === '--output')
  const explicit = index === -1 ? undefined : process.argv[index + 1]
  return explicit ?? 'output/eval/answer-suite-report.json'
}
