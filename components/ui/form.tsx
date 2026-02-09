import type * as LabelPrimitive from '@radix-ui/react-label'
import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

function Form({ className, ...props }: React.ComponentProps<'form'>) {
  return <form className={cn('space-y-5', className)} {...props} />
}
Form.displayName = 'Form'

function FormItem({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('space-y-2', className)} {...props} />
}
FormItem.displayName = 'FormItem'

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <Label
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    />
  )
}
FormLabel.displayName = 'FormLabel'

function FormControl({
  ...props
}: React.ComponentProps<typeof Slot> & {
  label?: string
  description?: string
}) {
  return <Slot {...props} />
}
FormControl.displayName = 'FormControl'

function FormMessage({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    />
  )
}
FormMessage.displayName = 'FormMessage'

export { Form, FormItem, FormLabel, FormControl, FormMessage }
