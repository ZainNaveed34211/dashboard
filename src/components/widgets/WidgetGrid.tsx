import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { widgetTitle } from '../../lib/widgets';
import type { WidgetItem } from '../../lib/api';
import WidgetCard from './WidgetCard';
import OverviewWidget from './OverviewWidget';
import MembersChartWidget from './MembersChartWidget';
import TeamWidget from './TeamWidget';
import DepartmentsWidget from './DepartmentsWidget';
import ActivityWidget from './ActivityWidget';

interface WidgetGridProps {
  companyId: string;
  widgets: WidgetItem[];
  onReorder: (widgets: WidgetItem[]) => void;
  onRemove: (index: number) => void;
}

function spanClass(w: number | undefined): string {
  if (w !== undefined && w >= 12) return 'col-span-12';
  if (w !== undefined && w >= 6) return 'col-span-12 md:col-span-6';
  return 'col-span-12 md:col-span-4';
}

function configLimit(config: Record<string, unknown> | undefined, fallback: number): number {
  const raw = config?.limit;
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.floor(raw))) : fallback;
}

interface SortableWidgetProps {
  sortableId: string;
  widget: WidgetItem;
  companyId: string;
  onRemove: () => void;
}

function SortableWidget({ sortableId, widget, companyId, onRemove }: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  let body: React.ReactNode = <p className="text-sm text-slate-600 dark:text-slate-300">This widget is no longer available.</p>;
  if (widget.id === 'overview') body = <OverviewWidget companyId={companyId} />;
  if (widget.id === 'members-chart') body = <MembersChartWidget companyId={companyId} />;
  if (widget.id === 'team') body = <TeamWidget companyId={companyId} limit={configLimit(widget.config, 10)} />;
  if (widget.id === 'departments') body = <DepartmentsWidget companyId={companyId} limit={configLimit(widget.config, 10)} />;
  if (widget.id === 'activity') body = <ActivityWidget companyId={companyId} limit={configLimit(widget.config, 10)} />;
  return (
    <div ref={setNodeRef} style={style} className={spanClass(widget.w)}>
      <WidgetCard title={widgetTitle(widget.id)} onRemove={onRemove} dragHandleProps={{ ...attributes, ...listeners }}>
        {body}
      </WidgetCard>
    </div>
  );
}

export default function WidgetGrid({ companyId, widgets, onReorder, onRemove }: WidgetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = widgets.map((w, index) => w.id + ':' + index);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(widgets, oldIndex, newIndex));
  }

  if (widgets.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#171a2e] dark:text-slate-300">No widgets on this dashboard yet. Add the first widget below.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-12 gap-4">
          {widgets.map((widget, index) => (
            <SortableWidget key={ids[index]} sortableId={ids[index]} widget={widget} companyId={companyId} onRemove={() => onRemove(index)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
