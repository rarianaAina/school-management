import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { supabase, describeSupabaseError } from '@/lib/supabase'
import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas/auth.schema'

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ForgotPasswordValues) {
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/definir-mot-de-passe`,
    })

    if (error) {
      toast.error(describeSupabaseError(error))
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Mail className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Vérifiez votre boîte mail</p>
          <p className="text-sm text-muted-foreground text-pretty">
            Si un compte est associé à cette adresse, un lien de réinitialisation vient d&apos;y
            être envoyé.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link to="/connexion">Retour à la connexion</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Indiquez votre adresse e-mail : nous vous enverrons un lien pour définir un nouveau mot
          de passe.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Adresse e-mail</FormLabel>
                <FormControl>
                  <Input {...field} type="email" autoComplete="email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Envoyer le lien
          </Button>
        </form>
      </Form>

      <Link
        to="/connexion"
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour à la connexion
      </Link>
    </div>
  )
}
