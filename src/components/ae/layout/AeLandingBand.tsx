import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AeLandingBandTone = "canvas" | "surface" | "muted" | "ink";
export type AeLandingBandHeight = "strip" | "fold" | "chapter";
export type AeLandingBandAlign = "start" | "center";

type AeLandingBandProps = Readonly<{
  labelledBy: string;
  children: ReactNode;
  tone?: AeLandingBandTone;
  height?: AeLandingBandHeight;
  align?: AeLandingBandAlign;
  id?: string;
  className?: string;
  footer?: ReactNode;
}>;

export function AeLandingBand({
  labelledBy,
  children,
  tone = "canvas",
  height = "chapter",
  align = "center",
  id,
  className,
  footer,
}: AeLandingBandProps) {
  const hasFooter = footer !== undefined;

  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-ae-landing-height={height}
      data-ae-landing-tone={tone}
      className={cn(
        "flex w-full flex-col",
        toneClass(tone),
        heightClass(height, hasFooter),
        hasFooter ? "justify-start" : alignClass(align),
        className,
      )}
    >
      <div
        className={cn(
          "ae-rail w-full",
          hasFooter && align === "center" ? "flex flex-1 flex-col justify-center" : null,
        )}
      >
        {children}
      </div>
      {hasFooter ? (
        <div className="ae-rail w-full pb-fold-peek">{footer}</div>
      ) : null}
    </section>
  );
}

function toneClass(tone: AeLandingBandTone): string {
  switch (tone) {
    case "canvas":
      return "bg-background text-foreground";
    case "surface":
      return "bg-container text-foreground";
    case "muted":
      return "bg-muted text-foreground";
    case "ink":
      return "bg-foreground text-background";
    default: {
      const _never: never = tone;
      return _never;
    }
  }
}

function heightClass(height: AeLandingBandHeight, hasFooter: boolean): string {
  switch (height) {
    case "strip":
      return "py-section md:py-page";
    case "fold":
      return cn(
        hasFooter ? "min-h-fold-hero" : "min-h-fold",
        "py-page md:py-section",
      );
    case "chapter":
      return "min-h-chapter py-band";
    default: {
      const _never: never = height;
      return _never;
    }
  }
}

function alignClass(align: AeLandingBandAlign): string {
  switch (align) {
    case "start":
      return "justify-start";
    case "center":
      return "justify-center";
    default: {
      const _never: never = align;
      return _never;
    }
  }
}
