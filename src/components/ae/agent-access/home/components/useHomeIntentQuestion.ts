import { useMutation, useQuery } from 'convex/react'

import { api } from '../../../../../../convex/_generated/api'

/** Data access for the home intent question; the component stays a leaf. */
export function useHomeIntentQuestion() {
  return {
    intent: useQuery(api.accountIntents.readMine, {}),
    answer: useMutation(api.accountIntents.answer),
  }
}
