import { evaluateCaseAsync } from '../lib/evaluators'

const vars = JSON.parse(process.argv[2] ?? '{}') as Record<string, string>

const result = await evaluateCaseAsync(vars)
console.log(JSON.stringify(result))
