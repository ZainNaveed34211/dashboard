import type { WidgetItem } from './api';

export const WIDGET_CATALOG: { id: string; title: string }[] = [
  { id: 'overview', title: 'Company overview' },
  { id: 'members-chart', title: 'Members by department' },
  { id: 'team', title: 'Team' },
  { id: 'departments', title: 'Departments' },
  { id: 'activity', title: 'Recent activity' },
];

export const BUILTIN_WIDGETS: WidgetItem[] = [
  { id: 'overview', x: 0, y: 0, w: 12, h: 4 },
  { id: 'members-chart', x: 0, y: 4, w: 6, h: 4 },
  { id: 'team', x: 6, y: 4, w: 6, h: 4 },
  { id: 'departments', x: 0, y: 8, w: 6, h: 4 },
  { id: 'activity', x: 6, y: 8, w: 6, h: 4 },
];

export function widgetTitle(id: string): string {
  return WIDGET_CATALOG.find((w) => w.id === id)?.title || id;
}

export function widgetsFrom(data: Record<string, unknown>): WidgetItem[] {
  const layout = data.layout as { widgets?: unknown } | undefined;
  const list = layout?.widgets;
  if (!Array.isArray(list)) return BUILTIN_WIDGETS;
  const items = list.filter((w): w is WidgetItem => !!w && typeof (w as WidgetItem).id === 'string');
  return items.length > 0 ? items : BUILTIN_WIDGETS;
}

export function layoutSource(data: Record<string, unknown>): string {
  const layout = data.layout as { source?: unknown } | undefined;
  return typeof layout?.source === 'string' ? layout.source : '';
}
