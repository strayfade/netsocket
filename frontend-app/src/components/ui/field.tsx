import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

export function Field({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />
}

export function FieldLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Label>) {
  return <Label className={cn(className)} {...props} />
}

export function FieldDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />
}

export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-destructive', className)} role="alert" {...props} />
}

export function FieldRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-3', className)} {...props} />
}
