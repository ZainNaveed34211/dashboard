import type { ReactNode } from 'react';

interface WidgetCardProps {
  title: string;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
  children: ReactNode;
}

export default function WidgetCard({ title, onRemove, dragHandleProps, children }: WidgetCardProps) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="cursor-grab text-base font-bold active:cursor-grabbing" {...dragHandleProps}>{title}</h3>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={'Remove ' + title} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Remove</button>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}
