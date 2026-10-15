export function renderTrialResult(result) {
  if (result.kind !== 'completed') return `**Action blocked**\n${result.code ?? result.kind}`
  const output = result.output
  if (output.sources) return '**Completed synthetic research**\n\n| Finding | Date | Source |\n|---|---|---|\n'
    + output.sources.map(source => `| ${source.fact} | ${source.date} | [${source.title}](${source.url}) |`).join('\n')
  return '**Completed synthetic audit**\n\n' + output.findings.map(finding => `- ${finding.finding}`).join('\n')
}
