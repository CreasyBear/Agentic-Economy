import { internalQuery, internalMutation } from './_generated/server'
import { readBookingArgs, readBookingResult, readBookingHandler } from './lib/money/managedCall/booking'
import { attachReservationArgs, attachReservationResult, attachReservationHandler, markReservationUnknownArgs, markReservationUnknownResult, markReservationUnknownHandler } from './lib/money/managedCall/reservation'

export const readBooking = internalQuery({
  args: readBookingArgs.fields,
  returns: readBookingResult,
  handler: readBookingHandler,
})

export const attachReservation = internalMutation({
  args: attachReservationArgs.fields,
  returns: attachReservationResult,
  handler: attachReservationHandler,
})

export const markReservationUnknown = internalMutation({
  args: markReservationUnknownArgs.fields,
  returns: markReservationUnknownResult,
  handler: markReservationUnknownHandler,
})
