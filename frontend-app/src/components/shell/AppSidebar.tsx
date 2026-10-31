import { NavLink } from 'react-router-dom'
import {
  CloudDownload,
  LayoutDashboard,
  LogOut,
  Settings,
  Smartphone,
  Download,
  Workflow,
  PanelsTopLeft,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/automate', label: 'Automate', icon: Workflow, id: 'automate' },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'dashboard' },
  { to: '/panels', label: 'Panels', icon: PanelsTopLeft, id: 'panels' },
] as const

type AppSidebarProps = {
  onOpenBackup: () => void
}

export function AppSidebar({ onOpenBackup }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      <SidebarTrigger />
      <Sidebar>
        <SidebarHeader>
          <NavLink
            to="/dashboard"
            className="inline-flex items-center"
            aria-label="netsocket home"
            onClick={closeMobile}
          >
            <img src="/hero.webp" alt="" className="h-6 w-auto" />
          </NavLink>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {tabs.map((tab) => (
              <SidebarMenuItem key={tab.id}>
                <NavLink
                  to={tab.to}
                  data-shell-tab={tab.id}
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-white !text-black hover:bg-white hover:!text-black [&_svg]:!text-black'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )
                  }
                >
                  <tab.icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{tab.label}</span>
                </NavLink>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" asChild>
                <a href="/downloads/overlay" aria-label="Download Overlay" onClick={closeMobile}>
                  <Download className="h-4 w-4" />
                  Download Overlay
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Desktop overlay installer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" asChild>
                <a href="/downloads/android" aria-label="Download Android app" onClick={closeMobile}>
                  <Smartphone className="h-4 w-4" />
                  Download Android
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Android companion app</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            type="button"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={() => {
              closeMobile()
              onOpenBackup()
            }}
            aria-label="Backup"
          >
            <CloudDownload className="h-4 w-4" />
            Backup
          </Button>
          <Button
            variant="ghost"
            type="button"
            id="open-settings"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={closeMobile}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          <Separator className="my-1" />
          <SidebarMenuButton type="button" asChild>
            <a href="/logout" aria-label="Log out" onClick={closeMobile}>
              <LogOut className="h-4 w-4" />
              Log Out
            </a>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
