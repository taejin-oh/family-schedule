'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger

function SheetPortal({ children }: { children: React.ReactNode }) {
  return <DialogPrimitive.Portal>{children}</DialogPrimitive.Portal>
}

function SheetOverlay({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      className={cn('fixed inset-0 z-50 bg-black/50', className)}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'rounded-t-2xl border-t bg-background px-6 pb-8 pt-4 shadow-2xl',
          'data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
          'transition-transform duration-200',
          className,
        )}
        {...props}
      >
        {/* drag handle */}
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        {children}
      </DialogPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 mb-4', className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

function SheetClose({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium',
        'hover:bg-muted hover:text-foreground transition-colors px-2.5',
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Close>
  )
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose }
