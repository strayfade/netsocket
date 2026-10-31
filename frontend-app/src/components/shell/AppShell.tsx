import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { AppSidebar } from './AppSidebar'
import { BackupDialog } from './BackupDialog'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

type AppShellProps = {
  flush?: boolean
  className?: string
}

export function AppShell({ flush = false, className }: AppShellProps) {
  const [backupOpen, setBackupOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <SidebarProvider>
      <div className={cn('flex min-h-svh w-full bg-background text-foreground', className)}>
        <AppSidebar onOpenBackup={() => setBackupOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
        <SidebarInset className={cn('min-w-0 flex-1', flush && 'h-svh overflow-hidden p-0')}>
          <div className={cn(!flush && 'p-4 md:p-6', flush && 'relative h-full min-h-0 w-full overflow-hidden p-0')}>
            <Outlet />
          </div>
        </SidebarInset>
        <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>
    </SidebarProvider>
  )
}
