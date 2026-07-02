import { readFileSync } from 'node:fs'

import {
  auditAnswerEvalCoverage,
  auditPromptfooAnswerConfig,
} from '../lib/coverage'

const promptfooConfig = readFileSync(
  new URL('../promptfooconfig.yaml', import.meta.url),
  'utf8',
)
const coverage = auditAnswerEvalCoverage()
const promptfooIssues = auditPromptfooAnswerConfig(promptfooConfig)
const issues = [...coverage.issues, ...promptfooIssues]

if (issues.length > 0) {
  for (const issue of issues) {
    const caseSuffix = issue.caseId === undefined ? '' : ` case=${issue.caseId}`
    const tagSuffix = issue.tag === undefined ? '' : ` tag=${issue.tag}`
    console.error(`[${issue.code}]${caseSuffix}${tagSuffix} ${issue.message}`)
  }
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      cases: coverage.caseCount,
      turnCases: coverage.turnCaseCount,
      threadCases: coverage.threadCaseCount,
      broadSeedBusinesses: coverage.broadSeedBusinessCount,
      coveredTags: coverage.coveredTags,
    },
    null,
    2,
  ),
)
