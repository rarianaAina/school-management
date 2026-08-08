import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Page introuvable"
      description="Le lien suivi n'existe pas ou n'est plus disponible."
      action={
        <Button asChild variant="outline">
          <Link to="/">Retour à l'accueil</Link>
        </Button>
      }
    />
  )
}
