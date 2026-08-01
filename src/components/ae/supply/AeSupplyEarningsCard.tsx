import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

export type SupplyEarningsState = 'unavailable' | 'available'

export function AeSupplyEarningsCard({ state }: Readonly<{ state: SupplyEarningsState }>) {
  return (
    <Card>
      <CardHeader className="p-5 pb-0">
        <CardTitle>
          <h3 className="text-lg font-semibold text-foreground">Earnings</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        {state === 'unavailable' ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Earnings are not available yet.</EmptyTitle>
              <EmptyDescription>Earnings and payouts will appear after payment support is enabled. No earnings are recorded from setup or test calls.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <p className="block text-muted-foreground">Your current earnings are available.</p>
        )}
      </CardContent>
    </Card>
  )
}
