import type { WeekStat } from '../logic/stats';

/**
 * Inline SVG bar chart: total reps per week (bars) with the top-set marked
 * (amber dot). Hand-rolled to avoid a charting dependency.
 */
export function renderChartSVG(stats: WeekStat[]): string {
  if (!stats.some((s) => s.hasData)) {
    return '<div class="hist-line"><span>No data yet — log a few weeks.</span></div>';
  }

  const W = 320;
  const H = 132;
  const padL = 6;
  const padR = 6;
  const padTop = 14;
  const padBot = 20;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBot;
  const n = stats.length;
  const slot = plotW / n;
  const barW = slot * 0.54;
  const maxTotal = Math.max(...stats.map((s) => s.total), 1);

  const y = (v: number) => padTop + plotH - (v / maxTotal) * plotH;

  let bars = '';
  let dots = '';
  let labels = '';
  stats.forEach((s, i) => {
    const cx = padL + slot * i + slot / 2;
    labels += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--mut)">${s.label}</text>`;
    if (!s.hasData) return;
    const bx = cx - barW / 2;
    const by = y(s.total);
    const bh = padTop + plotH - by;
    bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" rx="3" fill="var(--acc)"/>`;
    bars += `<text x="${cx.toFixed(1)}" y="${(by - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--txt)">${s.total}</text>`;
    dots += `<circle cx="${cx.toFixed(1)}" cy="${y(s.top).toFixed(1)}" r="3.2" fill="var(--acc2)"/>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Total reps per week">
    ${bars}${dots}${labels}
  </svg>
  <div class="chart-legend"><span class="lg-bar"></span>Total reps&nbsp;&nbsp;<span class="lg-dot"></span>Top set</div>`;
}
