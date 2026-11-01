import * as React from 'react'
import { cn } from '@/lib/utils'

export function InputGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex w-full items-stretch overflow-hidden rounded-md border border-border bg-input focus-within:ring-2 focus-within:ring-ring [&>input]:border-0 [&>input]:bg-transparent [&>input]:shadow-none [&>input]:focus-visible:ring-0 [&>button]:rounded-none [&>button]:border-0 [&>button]:h-auto [&>button]:self-stretch',
        className,
      )}
      {...props}
    />
  )
}

export function InputGroupAddon({
  className,
  align = 'start',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-3 text-sm text-muted-foreground',
        align === 'end' && 'ml-auto',
        className,
      )}
      {...props}
    />
  )
}
