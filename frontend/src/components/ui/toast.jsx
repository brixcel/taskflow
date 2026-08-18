import * as React from "react"
import { cva } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default:
          "border-[var(--color-canvas-card-border,#ebebeb)] bg-[var(--color-canvas-card,#ffffff)] text-[var(--color-canvas-ink,#0f1011)]",
        destructive:
          "destructive group border-[var(--color-banner-error-border,rgba(238,0,0,0.25))] bg-[var(--color-banner-error-bg,#f7d4d6)] text-[var(--color-banner-error-fg,#c50000)]",
        success:
          "border-[var(--color-banner-success-border,rgba(0,112,243,0.25))] bg-[var(--color-banner-success-bg,#d3e5ff)] text-[var(--color-banner-success-fg,#0761d1)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef(({ className, variant, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = "Toast"

const ToastAction = React.forwardRef(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-btn-secondary-border,#ebebeb)] bg-transparent px-2 text-xs font-medium transition-colors hover:bg-[var(--color-canvas-hover,#f5f5f5)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-outline-color)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = "ToastAction"

const ToastClose = React.forwardRef(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "absolute right-1 top-1 rounded-md p-1 text-[var(--color-canvas-mute,#888888)] opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 cursor-pointer",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </button>
))
ToastClose.displayName = "ToastClose"

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs font-semibold text-[var(--color-canvas-ink,#0f1011)]", className)}
    {...props}
  />
))
ToastTitle.displayName = "ToastTitle"

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs text-[var(--color-canvas-body,#4d4d4d)] opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = "ToastDescription"

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastTitle,
  ToastDescription,
}
