import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { JSX } from 'react'
import type { ClipView } from '../../shared/ipc'
import { moveClip, sourceLabel } from '../helpers/ArrangeListHelper'

/**
 * The full clip list, arrangeable (PLAN.md 8, 11 M7).
 *
 * Reordering works from the keyboard as well as from a pointer, which is not a nicety: dragging
 * fifty small rows with a mouse is the least pleasant way to arrange anything, and some people
 * cannot do it at all. `dnd-kit` gives the pointer path; the arrow-key handlers on each row give a
 * direct one that needs no drag mode at all.
 */
export function ArrangeList({
  clips,
  cursorClipId,
  onChange
}: {
  clips: readonly ClipView[]
  cursorClipId: string | null
  onChange: (clipIds: string[]) => void
}): JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const ids = clips.map((clip) => clip.id)

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (over === null || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    onChange(moveClip(ids, from, to))
  }

  if (clips.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-spool-paper/40">
        Nothing captured yet. Copy something and it lands here.
      </p>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="space-y-1">
          {clips.map((clip, index) => (
            <Row
              key={clip.id}
              clip={clip}
              position={index + 1}
              isNext={clip.id === cursorClipId}
              onMove={(direction) => onChange(moveClip(ids, index, index + direction))}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function Row({
  clip,
  position,
  isNext,
  onMove
}: {
  clip: ClipView
  position: number
  isNext: boolean
  onMove: (direction: -1 | 1) => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clip.id
  })
  const source = sourceLabel(clip)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'flex items-center gap-2 rounded border px-2 py-1.5',
        isNext ? 'border-spool-thread/60 bg-spool-thread/10' : 'border-spool-paper/10',
        isDragging ? 'opacity-60' : ''
      ].join(' ')}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded px-1 text-spool-paper/30 hover:text-spool-paper/70"
        aria-label={`Reorder ${clip.preview}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <span
        className={
          isNext
            ? 'w-10 shrink-0 text-[10px] font-semibold text-spool-thread'
            : 'w-10 shrink-0 text-[10px] text-spool-paper/30'
        }
      >
        {isNext ? 'NEXT' : position}
      </span>

      <span className="flex-1 truncate text-sm text-spool-paper/80">{clip.preview}</span>

      {source !== null && (
        <span className="shrink-0 text-[10px] text-spool-paper/30">{source}</span>
      )}

      {/* The keyboard path: no drag mode, no modifier, just move this row. */}
      <span className="flex shrink-0 gap-0.5">
        <MoveButton label={`Move ${clip.preview} up`} onClick={() => onMove(-1)}>
          ↑
        </MoveButton>
        <MoveButton label={`Move ${clip.preview} down`} onClick={() => onMove(1)}>
          ↓
        </MoveButton>
      </span>
    </li>
  )
}

function MoveButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: string
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-xs text-spool-paper/40 hover:bg-spool-paper/10 hover:text-spool-paper"
    >
      {children}
    </button>
  )
}
