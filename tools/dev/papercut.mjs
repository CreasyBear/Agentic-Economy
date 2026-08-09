import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const USAGE = 'Usage: npm run papercut -- -m <model> "message"'
const args = process.argv.slice(2)
const [flag, model, message] = args

if (
  args.length !== 3 ||
  (flag !== '-m' && flag !== '--model') ||
  !model?.trim() ||
  !message?.trim()
) {
  console.error(USAGE)
  process.exitCode = 1
} else {
  const ledgerPath = process.env.PAPERCUT_LEDGER_PATH || resolve(process.cwd(), 'PAPERCUTS.md')
  let ledger = ''

  try {
    ledger = readFileSync(ledgerPath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const numbers = [...ledger.matchAll(/^(\d+)\.\s+/gm)].map(([, number]) => Number(number))
  const nextNumber = Math.max(0, ...numbers) + 1
  const formattedMessage = message
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, index) => (index === 0 ? line : `   ${line}`))
    .join('\n')
  const formattedModel = model.replace(/[\r\n]+/g, ' ')
  const separator = ledger === '' ? '' : ledger.endsWith('\n') ? '\n' : '\n\n'

  appendFileSync(
    ledgerPath,
    `${separator}${nextNumber}. ${formattedModel}: ${formattedMessage}\n`,
    'utf8',
  )
}
