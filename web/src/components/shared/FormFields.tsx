import type { ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface BaseFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: ReactNode
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled,
  className,
  type = 'text',
}: BaseFieldProps<T> & { type?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              value={field.value ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                field.onChange(type === 'number' ? (raw === '' ? null : Number(raw)) : raw)
              }}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled,
  className,
  rows = 4,
}: BaseFieldProps<T> & { rows?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              rows={rows}
              placeholder={placeholder}
              disabled={disabled}
              value={field.value ?? ''}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export interface SelectOption {
  value: string
  label: string
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder = 'Sélectionner…',
  disabled,
  className,
  options,
}: BaseFieldProps<T> & { options: SelectOption[] }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <Select
            onValueChange={field.onChange}
            value={field.value ?? undefined}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/** Champ date natif : stocke une chaîne ISO `yyyy-MM-dd`, comme la colonne Postgres. */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: BaseFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="date"
              disabled={disabled}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: BaseFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn(
            'flex flex-row items-center justify-between gap-4 rounded-lg border p-4',
            className,
          )}
        >
          <div className="space-y-0.5">
            <FormLabel>{label}</FormLabel>
            {description ? <FormDescription>{description}</FormDescription> : null}
          </div>
          <FormControl>
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              disabled={disabled}
            />
          </FormControl>
        </FormItem>
      )}
    />
  )
}

/** Regroupe des champs sous un intertitre dans un formulaire long. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}
