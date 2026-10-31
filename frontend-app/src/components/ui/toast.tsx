import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'

export function toast(message: string, opts?: { description?: string }) {
  window.dispatchEvent(new CustomEvent('ns-toast', { detail: { message } }))
  return sonnerToast(message, opts)
}

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-card text-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
    />
  )
}
