import { compareCommandDescriptor } from './compare'
import { describeCommandDescriptor } from './describe'
import { listCommandDescriptor } from './list'
import { searchCommandDescriptor } from './search'

export const MARKET_TOOL_COMMAND_DESCRIPTORS = Object.freeze([
  listCommandDescriptor,
  searchCommandDescriptor,
  describeCommandDescriptor,
  compareCommandDescriptor,
] as const)
