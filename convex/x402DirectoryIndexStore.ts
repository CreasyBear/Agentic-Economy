import { internalMutation, internalQuery } from './_generated/server'
import { beginArgs, beginReturns, beginHandler, checkpointArgs, checkpointReturns, checkpointHandler, applyPageArgs, applyPageReturns, applyPageHandler, failArgs, failReturns, failHandler } from './lib/market/directoryIndex/refreshFlow'
import { reconcileProviderDirectoryRowsArgs, reconcileProviderDirectoryRowsReturns, reconcileProviderDirectoryRowsHandler } from './lib/market/directoryIndex/providerRows'
import { cleanupArgs, cleanupReturns, cleanupHandler } from './lib/market/directoryIndex/cleanup'

export const begin = internalMutation({ args: beginArgs, returns: beginReturns, handler: beginHandler })
export const checkpoint = internalQuery({ args: checkpointArgs, returns: checkpointReturns, handler: checkpointHandler })
export const reconcileProviderDirectoryRows = internalMutation({ args: reconcileProviderDirectoryRowsArgs, returns: reconcileProviderDirectoryRowsReturns, handler: reconcileProviderDirectoryRowsHandler })
export const applyPage = internalMutation({ args: applyPageArgs, returns: applyPageReturns, handler: applyPageHandler })
export const fail = internalMutation({ args: failArgs, returns: failReturns, handler: failHandler })
export const cleanup = internalMutation({ args: cleanupArgs, returns: cleanupReturns, handler: cleanupHandler })
