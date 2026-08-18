import * as React from "react"
import { cn } from "../../lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-[var(--color-input-border,#ebebeb)] bg-[var(--color-input-bg,#ffffff)] px-3 py-2 text-sm text-[var(--color-input-text,#171717)] shadow-xs transition-colors placeholder:text-[var(--color-input-placeholder,#888888)] focus-visible:outline-none focus-visible:border-[var(--color-input-focus-border,#171717)] focus-visible:ring-1 focus-visible:ring-[var(--focus-outline-color,#0f1011)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
