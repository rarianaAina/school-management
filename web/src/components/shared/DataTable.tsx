import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  column: string
  direction: SortDirection
}

export interface Column<T> {
  /** Identifiant stable ; sert aussi de clé de tri côté serveur. */
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  /** Masque la colonne en dessous de `md` (vues mobiles élèves/parents). */
  hideOnMobile?: boolean
  className?: string
  width?: string
}

export interface PaginationState {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export interface SelectionState<T> {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  isSelectable?: (row: T) => boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowId: (row: T) => string
  isLoading?: boolean
  emptyState?: ReactNode
  onRowClick?: (row: T) => void
  sort?: SortState | null
  onSortChange?: (sort: SortState) => void
  pagination?: PaginationState
  selection?: SelectionState<T>
  /** Barre d'actions affichée quand au moins une ligne est sélectionnée. */
  bulkActions?: (selectedIds: string[]) => ReactNode
  className?: string
}

const ALIGN_CLASS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isLoading = false,
  emptyState,
  onRowClick,
  sort,
  onSortChange,
  pagination,
  selection,
  bulkActions,
  className,
}: DataTableProps<T>) {
  const selectableRows = selection
    ? rows.filter((row) => selection.isSelectable?.(row) ?? true)
    : []
  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((row) => selection!.selectedIds.includes(getRowId(row)))
  const someSelected =
    !allSelected && selectableRows.some((row) => selection!.selectedIds.includes(getRowId(row)))

  function toggleAll() {
    if (!selection) return
    selection.onChange(allSelected ? [] : selectableRows.map(getRowId))
  }

  function toggleRow(id: string) {
    if (!selection) return
    const next = selection.selectedIds.includes(id)
      ? selection.selectedIds.filter((current) => current !== id)
      : [...selection.selectedIds, id]
    selection.onChange(next)
  }

  function handleSort(column: Column<T>) {
    if (!column.sortable || !onSortChange) return
    const direction: SortDirection =
      sort?.column === column.id && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ column: column.id, direction })
  }

  const columnCount = columns.length + (selection ? 1 : 0)
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1

  return (
    <div className={cn('space-y-3', className)}>
      {selection && selection.selectedIds.length > 0 && bulkActions ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-accent/40 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selection.selectedIds.length} sélectionné
            {selection.selectedIds.length > 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bulkActions(selection.selectedIds)}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {selection ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Tout sélectionner"
                    disabled={selectableRows.length === 0}
                  />
                </TableHead>
              ) : null}

              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    ALIGN_CLASS[column.align ?? 'left'],
                    column.hideOnMobile && 'hidden md:table-cell',
                    column.className,
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 gap-1.5 px-2 font-medium"
                      onClick={() => handleSort(column)}
                    >
                      {column.header}
                      {sort?.column === column.id ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-40" />
                      )}
                    </Button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {Array.from({ length: columnCount }).map((__, cellIndex) => (
                    <TableCell key={`skeleton-${rowIndex}-${cellIndex}`}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="h-40 p-0">
                  {emptyState ?? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Aucun résultat.
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const id = getRowId(row)
                const isSelected = selection?.selectedIds.includes(id) ?? false
                return (
                  <TableRow
                    key={id}
                    data-state={isSelected ? 'selected' : undefined}
                    className={cn(onRowClick && 'cursor-pointer')}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selection ? (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(id)}
                          disabled={!(selection.isSelectable?.(row) ?? true)}
                          aria-label="Sélectionner la ligne"
                        />
                      </TableCell>
                    ) : null}

                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        className={cn(
                          ALIGN_CLASS[column.align ?? 'left'],
                          column.hideOnMobile && 'hidden md:table-cell',
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {pagination.total} résultat{pagination.total > 1 ? 's' : ''} — page {pagination.page} sur{' '}
            {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pageCount}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
