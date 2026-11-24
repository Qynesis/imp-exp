import { pct } from './pct'

/** "↑ 12%" in green or "↓ 8%" in orange against the period before; "new" when there was nothing before, a dash when nothing either time. */
export const Growth = ({ v }: { v: number | null }) =>
  v === null ? <span className="t-muted">new</span> : v === 0 ? <span className="t-muted">—</span> : <span className={v > 0 ? 't-good' : 't-warn'}>{v > 0 ? '↑' : '↓'} {pct(Math.abs(v))}</span>
