import { internalMutation } from './_generated/server'
import {
  recordQualifiedUseArgs,
  recordQualifiedUseResult,
  recordQualifiedUseHandler,
} from './lib/money/qualifiedUse/record'

export const recordQualifiedUse = internalMutation({
  args: recordQualifiedUseArgs.fields,
  returns: recordQualifiedUseResult,
  handler: recordQualifiedUseHandler,
})
