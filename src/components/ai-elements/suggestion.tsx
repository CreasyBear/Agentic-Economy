"use client";

import { Button, type ButtonProps } from "@astryxdesign/core/Button";
import { cn } from "@/lib/utils";
import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export type SuggestionsProps = ComponentProps<"div"> & {
  wrap?: boolean;
};

export const Suggestions = ({
  className,
  children,
  wrap = false,
  ...props
}: SuggestionsProps) => (
  <div
    className={cn(
      "w-full",
      wrap ? "overflow-visible whitespace-normal" : "overflow-x-auto whitespace-nowrap",
    )}
    {...props}
  >
    <div
      className={cn(
        "flex items-center gap-2",
        wrap ? "w-full flex-wrap" : "w-max flex-nowrap",
        className,
      )}
    >
      {children}
    </div>
  </div>
);

type AstryxButtonVariant = NonNullable<ButtonProps["variant"]>;
type SuggestionVariant = AstryxButtonVariant | "outline";

export type SuggestionProps = {
  asChild?: boolean;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  suggestion: string;
  onClick?: (suggestion: string) => void;
  type?: "button" | "submit" | "reset";
  variant?: SuggestionVariant;
  size?: ButtonProps["size"];
  "aria-label"?: string;
};

const suggestionVariantMap: Record<SuggestionVariant, AstryxButtonVariant> = {
  destructive: "destructive",
  ghost: "ghost",
  outline: "secondary",
  primary: "primary",
  secondary: "secondary",
};

export const Suggestion = ({
  asChild = false,
  suggestion,
  onClick,
  className,
  variant = "secondary",
  size = "sm",
  children,
  disabled,
  id,
  "aria-label": ariaLabel,
  type = "button",
}: SuggestionProps) => {
  const handleClick = () => {
    onClick?.(suggestion);
  };

  if (asChild && isValidElement<{ className?: string; onClick?: (event: MouseEvent<HTMLElement>) => void }>(children)) {
    return cloneElement(children as ReactElement<{ className?: string; onClick?: (event: MouseEvent<HTMLElement>) => void }>, {
      className: cn(
        "inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-medium text-primary no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
        children.props.className,
      ),
      onClick: (event: MouseEvent<HTMLElement>) => {
        children.props.onClick?.(event);
        if (!event.defaultPrevented) {
          onClick?.(suggestion);
        }
      },
    });
  }

  return (
    <Button
      aria-label={ariaLabel}
      className={cn("cursor-pointer rounded-full px-4", className)}
      isDisabled={disabled ?? false}
      label={ariaLabel ?? (typeof children === "string" ? children : suggestion)}
      onClick={handleClick}
      size={size}
      type={type}
      variant={suggestionVariantMap[variant]}
    >
      {children || suggestion}
    </Button>
  );
};
