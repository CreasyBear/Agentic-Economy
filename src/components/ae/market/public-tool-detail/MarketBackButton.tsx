import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { useMarketBackNavigation } from '@/components/ae/market/market-return-context'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import type { MarketBackButtonProps } from './public-tool-detail.contracts'

export function MarketBackButton({ label, ...buttonProps }: MarketBackButtonProps) {
  const router = useRouter()
  const back = useMarketBackNavigation()
  if (back === 'history') {
    return (
      <Button type="button" onClick={() => router.history.back()} {...buttonProps}>
        <ArrowLeftIcon aria-hidden="true" />
        {label}
      </Button>
    )
  }
  return (
    <Link
      to="/market"
      className={cn(buttonVariants({ variant: buttonProps.variant }), buttonProps.className)}
    >
      <ArrowLeftIcon aria-hidden="true" />
      {label}
    </Link>
  )
}
