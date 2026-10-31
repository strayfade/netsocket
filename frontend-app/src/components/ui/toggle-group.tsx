import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cn } from '@/lib/utils'

// Single-source toggle styling (kept local so the group matches without a separate
// toggle.tsx); data-[state=on] uses the inverted primary chip like the app sidebar.
export const toggleItemVariants =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-white data-[state=on]:text-black data-[state=on]:hover:bg-white [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'

const ToggleSizeContext = React.createContext<'default' | 'sm'>('default')

export function ToggleGroup({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & { size?: 'default' | 'sm' }) {
  return (
    <ToggleSizeContext.Provider value={size}>
      <ToggleGroupPrimitive.Root className={cn('flex items-center gap-1', className)} {...props} />
    </ToggleSizeContext.Provider>
  )
}

export function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const size = React.useContext(ToggleSizeContext)
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        toggleItemVariants,
        size === 'sm' ? 'h-8 min-w-8 px-2.5 text-xs' : 'h-9 min-w-9 px-3',
        className,
      )}
      {...props}
    />
  )
}
