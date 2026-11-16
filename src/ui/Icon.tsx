/**
 * Line icons on a 24px grid, drawn with a 1.8 stroke and round ends so they match the type.
 * Each entry is one SVG path; add new ones here and they become valid `IconName`s.
 */
const PATHS = {
  // navigation
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  factory: 'M3 21h18M4 21V11l5 3v-3l5 3V8l2-5h3l1 18M8 17h2M13 17h2',
  store: 'M3 9.5 4.5 4h15L21 9.5M3 9.5V20h18V9.5M3 9.5c0 1.4 1.1 2.5 2.5 2.5S8 10.9 8 9.5c0 1.4 1.1 2.5 2.5 2.5h3c1.4 0 2.5-1.1 2.5-2.5 0 1.4 1.1 2.5 2.5 2.5S21 10.9 21 9.5M10 20v-5h4v5',
  truck: 'M2 6h12v10H2zM14 9h4l3 3.5V16h-7M6.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ship: 'M3 13h18l-2.2 5H5.2zM6 13V9h12v4M10 9V5h4v4M2 21.5c1.7 0 2.3-1 4-1s2.3 1 4 1 2.3-1 4-1 2.3 1 4 1 2.3-1 4-1',
  shield: 'M12 3 20 6v6c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  layers: 'M12 3 21 8l-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01',
  badge: 'M4 5h16v14H4zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 16c.5-1.8 1.6-3 3-3s2.5 1.2 3 3M14.5 9H18M14.5 13H17',
  chart: 'M4 4v16h16M8 16v-4M12 16V8M16 16v-6',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  settings: 'M3 6h10M17 6h4M3 12h4M11 12h10M3 18h12M19 18h2M15 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  // actions
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  cart: 'M3 4h2.2l2.3 11h10.3L20 8H6.3M9 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  hammer: 'M4.5 19.5 13 11M11 6.5 15.5 2 22 8.5 19.5 11 18 9.5l-3.5 3.5L10.5 9 12 7.5z',
  adjust: 'M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3M2 15h4M10 8h4M18 17h4',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  restore: 'M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H3',
  // status and values
  money: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 9.5v.01M17.5 14.5v.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  alert: 'M12 3.5 21.5 20h-19zM12 10v4.5M12 17.5v.01',
  tag: 'M3 12.5V3h9.5l8.5 8.5-9.5 9.5zM7.5 7.5v.01',
  route: 'M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 18h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowIn: 'M12 4v12M7 11l5 5 5-5',
  arrowOut: 'M12 20V8M7 13l5-5 5 5',
  // controls
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
} as const
export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Tinted rounded square holding an icon, for stat cards, section headings and source cards. */
export function IconBadge({ name, tone = 'brand', size = 18 }: { name: IconName; tone?: 'brand' | 'warn' | 'info' | 'good' | 'muted'; size?: number }) {
  return (
    <span className={`icon-badge ${tone}`}>
      <Icon name={name} size={size} />
    </span>
  )
}
