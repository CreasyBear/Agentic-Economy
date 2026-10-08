import { Button } from '@/components/arc/button/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function AeTableLayoutMenu({ density, onDensityChange, onReset }: {
  density: 'comfortable' | 'compact'
  onDensityChange: (value: 'comfortable' | 'compact') => void
  onReset: () => void
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="secondary" size="sm">Table view</Button>} />
    <DropdownMenuContent align="end">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density} onValueChange={value => {
          if (value === 'comfortable' || value === 'compact') onDensityChange(value)
        }}>
          <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onReset}>Reset table view</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
