import * as React from "react"
import { cn } from "../../lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-[var(--color-input-border,#ebebeb)] bg-[var(--color-input-bg,#ffffff)] px-3 py-1.5 text-sm text-[var(--color-input-text,#171717)] shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--color-input-placeholder,#888888)] focus-visible:outline-none focus-visible:border-[var(--color-input-focus-border,#171717)] focus-visible:ring-1 focus-visible:ring-[var(--focus-outline-color,#0f1011)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
