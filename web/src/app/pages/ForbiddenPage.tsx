import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'

export function ForbiddenPage() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Accès refusé"
      description="Votre rôle ne donne pas accès à cette page. Contactez l'administration de votre établissement si vous pensez qu'il s'agit d'une erreur."
      action={
        <Button asChild variant="outline">
          <Link to="/">Retour à l'accueil</Link>
        </Button>
      }
    />
  )
}
