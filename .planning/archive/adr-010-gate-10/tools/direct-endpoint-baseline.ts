import { runFrozenDirectEndpointBaseline } from '@/modules/capability-supply/direct-endpoint-baseline-executor'

const run = await runFrozenDirectEndpointBaseline()
console.log(JSON.stringify(run, null, 2))
