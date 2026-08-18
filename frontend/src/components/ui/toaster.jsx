import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastAction,
} from "./toast"
import { useToast } from "./use-toast"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-h-screen w-full max-w-[380px] flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0">
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose onClick={() => dismiss(id)} />
          </Toast>
        )
      })}
    </div>
  )
}
