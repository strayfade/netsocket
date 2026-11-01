import { cn } from '@/lib/utils'

export function ButtonGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex items-center [&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md [&>button:not(:first-child)]:border-l-0',
        className,
      )}
      {...props}
    />
  )
}
