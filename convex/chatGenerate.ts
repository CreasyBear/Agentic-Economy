"use node"

import { internalAction } from './_generated/server'
import { generateArgs, generateResult } from './lib/chat/generate/contracts'
import { generateHandler } from './lib/chat/generate/run'

export const generate = internalAction({
  args: generateArgs.fields,
  returns: generateResult,
  handler: generateHandler,
})
