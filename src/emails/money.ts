import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'

/** Money in email copy goes through the one display format. Missing amounts print "--"; loaders refuse to send before that. */
export const formatMoney = (amount: ExactAmount | null | undefined): string => formatCurrencyAmount(amount)
