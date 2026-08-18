import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-outline-color)] disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-btn-primary-bg,#171717)] text-[var(--color-btn-primary-fg,#ffffff)] hover:bg-[var(--color-btn-primary-hover,#262626)] active:scale-[0.98]",
        secondary:
          "bg-[var(--color-btn-secondary-bg,#ffffff)] text-[var(--color-btn-secondary-fg,#171717)] border border-[var(--color-btn-secondary-border,#ebebeb)] hover:bg-[var(--color-btn-secondary-hover-bg,#fafafa)] hover:border-[var(--color-btn-secondary-hover-border,#a1a1a1)] active:scale-[0.98]",
        destructive:
          "bg-[var(--color-btn-danger-bg,#f7d4d6)] text-[var(--color-btn-danger-fg,#c50000)] border border-[var(--color-btn-danger-border,rgba(238,0,0,0.25))] hover:bg-[var(--color-btn-danger-hover-bg,#f4c2c5)] active:scale-[0.98]",
        outline:
          "border border-[var(--color-canvas-hairline-strong,#a1a1a1)] bg-transparent text-[var(--color-canvas-ink,#0f1011)] hover:bg-[var(--color-canvas-hover,#f5f5f5)] active:scale-[0.98]",
        ghost:
          "bg-transparent text-[var(--color-canvas-ink,#0f1011)] hover:bg-[var(--color-canvas-hover,#f5f5f5)] active:scale-[0.98]",
        link:
          "text-[var(--color-link,#0070f3)] underline-offset-4 hover:underline p-0 h-auto font-normal",
      },
      size: {
        default: "h-9 px-3.5 py-1.5 text-sm",
        sm: "h-8 px-2.5 py-1 text-xs rounded-md",
        lg: "h-10 px-5 py-2 text-base rounded-md",
        icon: "h-8 w-8 p-0 rounded-md shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
