import { compareCommandDescriptor } from './compare'
import { inspectCommandDescriptor } from './inspect'
import { inspectPlanCommandDescriptor } from './inspect-plan'
import { searchCommandDescriptor } from './search'

export const MARKET_OPERATION_COMMAND_DESCRIPTORS = Object.freeze([
  searchCommandDescriptor,
  inspectCommandDescriptor,
  compareCommandDescriptor,
  inspectPlanCommandDescriptor,
] as const)
