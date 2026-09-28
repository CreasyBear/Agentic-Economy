import { mutation, query } from './_generated/server'
import {
  listArgsValue, listResultValue, readArgsValue, readResultValue, recordArgsValue, recordResultValue,
  withdrawResultValue, ownerFindActiveArgsValue, ownerFindActiveResultValue,
  ownerListArgsValue, ownerReadArgsValue, ownerRecordArgsValue,
  ownerReplayArgsValue, ownerReplayResultValue, ownerWithdrawArgsValue,
} from './lib/market/demandSignals/contracts'
import { listHandler, readHandler, recordHandler, withdrawHandler } from './lib/market/demandSignals/credential'
import {
  ownerFindActiveHandler, ownerListHandler, ownerReadHandler, ownerRecordHandler,
  ownerReplayHandler, ownerWithdrawHandler,
} from './lib/market/demandSignals/owner'

export const record = mutation({ args: recordArgsValue.fields, returns: recordResultValue, handler: recordHandler })
export const list = query({ args: listArgsValue.fields, returns: listResultValue, handler: listHandler })
export const read = query({ args: readArgsValue.fields, returns: readResultValue, handler: readHandler })
export const withdraw = mutation({ args: readArgsValue.fields, returns: withdrawResultValue, handler: withdrawHandler })

export const ownerRecord = mutation({ args: ownerRecordArgsValue.fields, returns: recordResultValue, handler: ownerRecordHandler })
export const ownerReplay = query({ args: ownerReplayArgsValue.fields, returns: ownerReplayResultValue, handler: ownerReplayHandler })
export const ownerFindActive = query({ args: ownerFindActiveArgsValue.fields, returns: ownerFindActiveResultValue, handler: ownerFindActiveHandler })
export const ownerList = query({ args: ownerListArgsValue.fields, returns: listResultValue, handler: ownerListHandler })
export const ownerRead = query({ args: ownerReadArgsValue.fields, returns: readResultValue, handler: ownerReadHandler })
export const ownerWithdraw = mutation({ args: ownerWithdrawArgsValue.fields, returns: withdrawResultValue, handler: ownerWithdrawHandler })
