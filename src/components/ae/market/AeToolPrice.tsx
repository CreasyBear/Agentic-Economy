import { cn } from "@/lib/utils";
import './PriceComposition.css'

/**
 * The price figure that leads every buy decision. Same component on the
 * market row and the operation-detail first viewport so the price always
 * reads identically: mono, tabular, no digit jitter.
 */
export function AeToolPrice({
  price,
  label = "Total price",
  size = "md",
  className,
}: {
  price: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  validUntil?: number;
}) {
  return (
    <p className={cn("arc-market arc-tool-price", className)} data-size={size}>
      <span className="arc-tool-price-label">
        {label}
      </span>
      <span className="arc-tool-price-value">
        {price}
      </span>
    </p>
  );
}

export function ToolPriceText({ price }: { price: string; validUntil?: number }) {
  return <>{price}</>;
}
