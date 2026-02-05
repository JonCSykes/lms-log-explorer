import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const Form = ({
  className,
  ...props
}: React.ComponentProps<"form">) => (
  <form
    className={cn("space-y-5", className)}
    {...props}
  />
)
Form.displayName = "Form"

const FormItem = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div className={cn("space-y-2", className)} {...props} />
)
FormItem.displayName = "FormItem"

const FormLabel = ({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) => (
  <Label
    className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
    {...props}
  />
)
FormLabel.displayName = "FormLabel"

const FormControl = ({
  ...props
}: React.ComponentProps<typeof Slot> & { label?: string; description?: string }) => (
  <Slot
    {...props}
  />
)
FormControl.displayName = "FormControl"

const FormMessage = ({
  className,
  ...props
}: React.ComponentProps<"p">) => (
  <p
    className={cn("text-sm font-medium text-destructive", className)}
    {...props}
  />
)
FormMessage.displayName = "FormMessage"

export { Form, FormItem, FormLabel, FormControl, FormMessage }
