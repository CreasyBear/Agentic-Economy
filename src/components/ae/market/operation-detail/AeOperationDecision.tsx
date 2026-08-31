import { AeOperationPrice } from '@/components/ae/market/AeOperationPrice'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { OperationInspectorModel } from './operation-inspector-model'

export function AeOperationDecision({
  model,
}: Readonly<{
  model: OperationInspectorModel
}>) {
  return (
    <Card role="region" aria-label={model.decisionLabel}>
      <CardHeader>
        <CardTitle><h3>{model.decisionLabel}</h3></CardTitle>
        <CardDescription>{model.decisionDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <AeOperationPrice
          price={model.totalPrice}
          size="lg"
          label="Total authorization"
        />
      </CardContent>
    </Card>
  )
}
