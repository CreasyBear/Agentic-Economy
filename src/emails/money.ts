import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'

/** Money in email copy goes through the one display format. Callers pass amounts they hold; an absent statement row total is the only case that falls back to the shared placeholder. */
export const formatMoney = (amount: ExactAmount | null | undefined): string => formatCurrencyAmount(amount)
