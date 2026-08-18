import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--focus-outline-color)] select-none shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-btn-primary-bg,#171717)] text-[var(--color-btn-primary-fg,#ffffff)]",
        secondary:
          "border-[var(--color-btn-secondary-border,#ebebeb)] bg-[var(--color-canvas-hover,#f5f5f5)] text-[var(--color-canvas-ink,#0f1011)]",
        destructive:
          "border-[var(--color-btn-danger-border,rgba(238,0,0,0.25))] bg-[var(--color-btn-danger-bg,#f7d4d6)] text-[var(--color-btn-danger-fg,#c50000)]",
        outline:
          "border-[var(--color-canvas-hairline-strong,#a1a1a1)] text-[var(--color-canvas-ink,#0f1011)] bg-transparent",
        todo:
          "border-[var(--color-badge-todo-border,#ebebeb)] bg-[var(--color-badge-todo-bg,#f5f5f5)] text-[var(--color-badge-todo-fg,#4d4d4d)]",
        progress:
          "border-[var(--color-badge-progress-border,rgba(245,166,35,0.25))] bg-[var(--color-badge-progress-bg,#ffefcf)] text-[var(--color-badge-progress-fg,#ab570a)]",
        done:
          "border-[var(--color-badge-done-border,rgba(0,112,243,0.25))] bg-[var(--color-badge-done-bg,#d3e5ff)] text-[var(--color-badge-done-fg,#0761d1)]",
        overdue:
          "border-[var(--color-badge-overdue-border,rgba(238,0,0,0.25))] bg-[var(--color-badge-overdue-bg,#f7d4d6)] text-[var(--color-badge-overdue-fg,#c50000)]",
        urgent:
          "border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.12)] text-[#e5484d]",
        high:
          "border-[rgba(247,104,8,0.3)] bg-[rgba(247,104,8,0.12)] text-[#f76808]",
        medium:
          "border-[rgba(0,112,243,0.25)] bg-[rgba(0,112,243,0.10)] text-[#0070f3]",
        low:
          "border-[rgba(138,143,152,0.2)] bg-[rgba(138,143,152,0.10)] text-[#8a8f98]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, dot, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
