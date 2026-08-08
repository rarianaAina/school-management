import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { GripVertical, MapPin, User } from 'lucide-react'
import type { TimetableEntry } from '@/types/domain'
import { WEEKDAY_LABELS } from '@/lib/formatters'
import { cn } from '@/lib/utils'

/** Pas de la grille, en minutes. Un cours de 2 h occupe donc 4 cellules. */
const STEP_MINUTES = 30
const CELL_HEIGHT = 30

export function toMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

export function toTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}:00`
}

/** Couleur stable par matière, à défaut de couleur choisie par l'établissement. */
const PALETTE = [
  'bg-chart-1/15 border-chart-1/40 text-chart-1',
  'bg-chart-2/15 border-chart-2/40 text-chart-2',
  'bg-chart-3/15 border-chart-3/40 text-chart-3',
  'bg-chart-4/15 border-chart-4/40 text-chart-4',
  'bg-chart-5/15 border-chart-5/40 text-chart-5',
]

function subjectClass(entry: TimetableEntry): string {
  const key = entry.subject_id ?? entry.subject_name ?? ''
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 997
  }
  return PALETTE[hash % PALETTE.length]!
}

interface SlotCardProps {
  entry: TimetableEntry
  editable: boolean
  showClass: boolean
  onSelect?: (entry: TimetableEntry) => void
  style?: React.CSSProperties
  isOverlay?: boolean
}

function SlotCard({ entry, editable, showClass, onSelect, style, isOverlay }: SlotCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id!,
    disabled: !editable,
  })

  const durationLabel = `${entry.start_time!.slice(0, 5)} – ${entry.end_time!.slice(0, 5)}`

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      className={cn(
        'group absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1.5 text-left',
        subjectClass(entry),
        isDragging && 'opacity-30',
        isOverlay && 'shadow-lg ring-2 ring-ring',
        editable && 'cursor-grab active:cursor-grabbing',
      )}
      {...(editable && !isOverlay ? { ...listeners, ...attributes } : {})}
      onClick={() => onSelect?.(entry)}
    >
      <p className="truncate text-xs font-semibold leading-tight text-foreground">
        {entry.subject_name}
      </p>
      <p className="tabular truncate text-[11px] text-muted-foreground">{durationLabel}</p>

      {showClass && entry.class_name ? (
        <p className="truncate text-[11px] text-muted-foreground">{entry.class_name}</p>
      ) : null}

      {entry.teacher_name ? (
        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <User className="size-3 shrink-0" />
          {entry.teacher_name}
        </p>
      ) : null}

      {entry.room_name ? (
        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {entry.room_name}
        </p>
      ) : null}

      {editable && !isOverlay ? (
        <GripVertical className="absolute right-0.5 top-1 size-3.5 opacity-0 transition-opacity group-hover:opacity-50" />
      ) : null}
    </div>
  )
}

function DropCell({ day, minutes }: { day: number; minutes: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}:${minutes}` })
  return (
    <div
      ref={setNodeRef}
      style={{ height: CELL_HEIGHT }}
      className={cn('border-b border-border/50', isOver && 'bg-primary/10')}
    />
  )
}

interface WeekGridProps {
  entries: TimetableEntry[]
  weekDays: number[]
  dayStart: string
  dayEnd: string
  editable?: boolean
  showClass?: boolean
  onMove?: (slotId: string, day: number, start: string, end: string) => void
  onSelect?: (entry: TimetableEntry) => void
}

export function WeekGrid({
  entries,
  weekDays,
  dayStart,
  dayEnd,
  editable = false,
  showClass = false,
  onMove,
  onSelect,
}: WeekGridProps) {
  const [dragged, setDragged] = useState<TimetableEntry | null>(null)

  const startMinutes = toMinutes(dayStart)
  const endMinutes = toMinutes(dayEnd)
  const rowCount = Math.max(1, Math.ceil((endMinutes - startMinutes) / STEP_MINUTES))

  const rows = useMemo(
    () => Array.from({ length: rowCount }, (_, index) => startMinutes + index * STEP_MINUTES),
    [rowCount, startMinutes],
  )

  const byDay = useMemo(() => {
    const map = new Map<number, TimetableEntry[]>()
    for (const day of weekDays) map.set(day, [])
    for (const entry of entries) {
      map.get(entry.day_of_week!)?.push(entry)
    }
    return map
  }, [entries, weekDays])

  const sensors = useSensors(
    // Un seuil de 5 px évite qu'un simple clic sur un cours déclenche un déplacement.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    setDragged(entries.find((entry) => entry.id === event.active.id) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const entry = dragged
    setDragged(null)

    if (!entry || !event.over || !onMove) return

    const [dayPart, minutesPart] = String(event.over.id).split(':')
    const day = Number(dayPart)
    const start = Number(minutesPart)
    const duration = toMinutes(entry.end_time!) - toMinutes(entry.start_time!)

    if (day === entry.day_of_week && start === toMinutes(entry.start_time!)) return
    if (start + duration > endMinutes) return

    onMove(entry.id!, day, toTimeString(start), toTimeString(start + duration))
  }

  function positionOf(entry: TimetableEntry): React.CSSProperties {
    const top = ((toMinutes(entry.start_time!) - startMinutes) / STEP_MINUTES) * CELL_HEIGHT
    const height =
      ((toMinutes(entry.end_time!) - toMinutes(entry.start_time!)) / STEP_MINUTES) * CELL_HEIGHT
    return { top, height: Math.max(height - 2, 22) }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div
          className="grid min-w-[720px]"
          style={{ gridTemplateColumns: `4rem repeat(${weekDays.length}, minmax(9rem, 1fr))` }}
        >
          {/* En-têtes */}
          <div className="sticky left-0 z-10 border-b border-r bg-muted/50" />
          {weekDays.map((day) => (
            <div
              key={`head-${day}`}
              className="border-b border-r bg-muted/50 px-3 py-2 text-center text-sm font-medium last:border-r-0"
            >
              {WEEKDAY_LABELS[day]}
            </div>
          ))}

          {/* Colonne des heures */}
          <div className="sticky left-0 z-10 border-r bg-card">
            {rows.map((minutes) => (
              <div
                key={`hour-${minutes}`}
                style={{ height: CELL_HEIGHT }}
                className="relative border-b border-border/50"
              >
                {minutes % 60 === 0 ? (
                  <span className="tabular absolute -top-2 right-2 bg-card px-1 text-[11px] text-muted-foreground">
                    {toTimeString(minutes).slice(0, 5)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Colonnes des jours */}
          {weekDays.map((day) => (
            <div key={`col-${day}`} className="relative border-r last:border-r-0">
              {rows.map((minutes) => (
                <DropCell key={`${day}-${minutes}`} day={day} minutes={minutes} />
              ))}

              {(byDay.get(day) ?? []).map((entry) => (
                <SlotCard
                  key={entry.id}
                  entry={entry}
                  editable={editable}
                  showClass={showClass}
                  onSelect={onSelect}
                  style={positionOf(entry)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged ? (
          <div className="w-40">
            <SlotCard
              entry={dragged}
              editable={false}
              showClass={showClass}
              isOverlay
              style={{
                position: 'relative',
                height:
                  ((toMinutes(dragged.end_time!) - toMinutes(dragged.start_time!)) /
                    STEP_MINUTES) *
                  CELL_HEIGHT,
              }}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
