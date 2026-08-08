import { useEffect, type ReactNode } from 'react'
import { useForm, type DefaultValues, type Resolver, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const SIZE_CLASS = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
} as const

interface FormDialogProps<TSchema extends z.ZodTypeAny> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  schema: TSchema
  defaultValues: DefaultValues<z.infer<TSchema>>
  /** La valeur de retour est ignorée : la modale se ferme dès que la promesse tient. */
  onSubmit: (values: z.infer<TSchema>) => unknown | Promise<unknown>
  children: (form: UseFormReturn<z.infer<TSchema>>) => ReactNode
  submitLabel?: string
  cancelLabel?: string
  size?: keyof typeof SIZE_CLASS
}

/**
 * Modale de formulaire : Dialog + React Hook Form + validation Zod.
 *
 * Le contenu est une render-prop qui reçoit l'instance du formulaire, ce qui
 * permet aux champs conditionnels de lire `form.watch(...)` sans contexte
 * supplémentaire.
 */
export function FormDialog<TSchema extends z.ZodTypeAny>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  onSubmit,
  children,
  submitLabel = 'Enregistrer',
  cancelLabel = 'Annuler',
  size = 'md',
}: FormDialogProps<TSchema>) {
  type Values = z.infer<TSchema>

  const form = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues,
  })

  // Réinitialise à chaque ouverture : évite de rouvrir la modale sur les
  // valeurs de l'enregistrement précédemment édité.
  useEffect(() => {
    if (open) form.reset(defaultValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const isSubmitting = form.formState.isSubmitting

  async function handleSubmit(values: Values) {
    await onSubmit(values)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={isSubmitting ? undefined : onOpenChange}>
      <DialogContent className={cn('max-h-[90dvh] overflow-hidden p-0', SIZE_CLASS[size])}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex max-h-[90dvh] flex-col">
            <DialogHeader className="border-b px-6 py-4 text-left">
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>

            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="space-y-5 px-6 py-5">{children(form)}</div>
            </ScrollArea>

            <DialogFooter className="border-t px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
