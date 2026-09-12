import { createFileRoute, redirect } from '@tanstack/react-router'

import { validateRootSearch } from '@/modules/market/home-catalogue'

export { HomeCapabilityResults } from '@/components/ae/home/AeHomeLanding'

export const Route = createFileRoute('/')({
  validateSearch: validateRootSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/market',
      search: search.q === undefined ? {} : { query: search.q },
      replace: true,
    })
  },
})
