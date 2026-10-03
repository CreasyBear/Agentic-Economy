import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { useMarketBackNavigation } from '@/components/ae/market/market-return-context'
import { Button } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
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
      className={cn(buttonStyles.button, buttonStyles[buttonProps.variant ?? 'primary'], buttonStyles.md, buttonProps.className)}
    >
      <ArrowLeftIcon aria-hidden="true" />
      {label}
    </Link>
  )
}
