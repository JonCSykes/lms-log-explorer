'use client'

import { PanelLeft } from 'lucide-react'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  isMobile: boolean
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }
  return context
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)')
    const onChange = () => setIsMobile(mediaQuery.matches)
    onChange()
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

function SidebarProvider({
  children,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
}: {
  children: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openState, setOpenState] = React.useState(defaultOpen)
  const open = openProp ?? openState

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (openProp === undefined) {
        setOpenState(value)
      }
      onOpenChange?.(value)
    },
    [onOpenChange, openProp]
  )

  const toggle = React.useCallback(() => setOpen(!open), [open, setOpen])

  return (
    <SidebarContext.Provider value={{ open, setOpen, isMobile, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_ICON = '4rem'

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'aside'> & {
    collapsible?: 'icon' | 'none'
  }
>(({ className, collapsible = 'icon', ...props }, ref) => {
  const { open } = useSidebar()

  return (
    <aside
      ref={ref}
      data-slot="sidebar"
      data-collapsible={open ? 'none' : collapsible}
      className={cn(
        'group/sidebar-wrapper relative flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        className
      )}
      style={
        {
          '--sidebar-width': SIDEBAR_WIDTH,
          '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
        } as React.CSSProperties
      }
      {...props}
    >
      <div
        data-slot="sidebar-inner"
        className={cn(
          'flex h-full w-[var(--sidebar-width)] flex-col transition-[width] duration-200 ease-in-out',
          !open && collapsible === 'icon' && 'w-[var(--sidebar-width-icon)]'
        )}
      >
        {props.children}
      </div>
    </aside>
  )
})
Sidebar.displayName = 'Sidebar'

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sidebar-header"
    className={cn(
      'flex flex-col gap-2 border-b border-sidebar-border',
      className
    )}
    {...props}
  />
))
SidebarHeader.displayName = 'SidebarHeader'

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sidebar-content"
    className={cn('flex-1 overflow-y-auto px-2 py-3', className)}
    {...props}
  />
))
SidebarContent.displayName = 'SidebarContent'

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sidebar-footer"
    className={cn('border-t border-sidebar-border p-2', className)}
    {...props}
  />
))
SidebarFooter.displayName = 'SidebarFooter'

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sidebar-group"
    className={cn('flex flex-col gap-2', className)}
    {...props}
  />
))
SidebarGroup.displayName = 'SidebarGroup'

const SidebarGroupLabel = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<'p'>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="sidebar-group-label"
    className={cn(
      'text-xs font-medium uppercase tracking-wide text-muted-foreground',
      className
    )}
    {...props}
  />
))
SidebarGroupLabel.displayName = 'SidebarGroupLabel'

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<'ul'>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-slot="sidebar-menu"
    className={cn('flex flex-col gap-1', className)}
    {...props}
  />
))
SidebarMenu.displayName = 'SidebarMenu'

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<'li'>
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-slot="sidebar-menu-item"
    className={cn('list-none', className)}
    {...props}
  />
))
SidebarMenuItem.displayName = 'SidebarMenuItem'

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & {
    asChild?: boolean
    isActive?: boolean
  }
>(({ className, asChild = false, isActive, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      ref={ref}
      data-slot="sidebar-menu-button"
      data-active={isActive ? 'true' : 'false'}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
        className
      )}
      {...props}
    />
  )
})
SidebarMenuButton.displayName = 'SidebarMenuButton'

const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sidebar-inset"
    className={cn('flex min-h-screen flex-1 flex-col', className)}
    {...props}
  />
))
SidebarInset.displayName = 'SidebarInset'

const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'>
>(({ className, onClick, ...props }, ref) => {
  const { toggle } = useSidebar()

  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-9', className)}
      onClick={(event) => {
        onClick?.(event)
        toggle()
      }}
      {...props}
    >
      <PanelLeft className="size-4" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = 'SidebarTrigger'

const SidebarRail = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="sidebar-rail"
    className={cn(
      'pointer-events-none absolute right-0 top-0 h-full w-px bg-sidebar-border',
      className
    )}
    {...props}
  />
))
SidebarRail.displayName = 'SidebarRail'

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
}
