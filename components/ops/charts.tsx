'use client';

/**
 * components/ops/charts.tsx
 *
 * Small, dependency-free SVG charts for /admin/ops. Colors carry status
 * only (checked for color-blind separation on the dark card surface), and
 * every chart has a legend and a hover tooltip with the exact numbers.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeriesPoint, Status } from '@/lib/ops/types';

export const STATUS_COLOR = {
  ok: '#8EE3B0',
  warn: '#FFB067',
  error: '#F2555A',
  neutral: '#9AA8B8',
} as const;

export function statusColor(status: Status): string {
  if (status === 'ok') return STATUS_COLOR.ok;
  if (status === 'down') return STATUS_COLOR.error;
  if (status === 'degraded' || status === 'issues') return STATUS_COLOR.warn;
  return 'rgba(255,255,255,0.3)';
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

function bucketLabel(iso: string, bucketSeconds: number): string {
  const d = new Date(iso);
  if (bucketSeconds >= 3600 * 6) return d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  if (bucketSeconds >= 1800) return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: bucketSeconds < 60 ? '2-digit' : undefined });
}

/** Width of a container, kept current as the window resizes. */
function useWidth(initial = 720): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, el.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(value: number): number {
  if (value <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function Legend({ items }: { items: Array<{ label: string; color: string; shape?: 'bar' | 'line' }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/55">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {item.shape === 'line' ? (
            <span aria-hidden className="inline-block h-[2px] w-3.5 rounded-full" style={{ background: item.color }} />
          ) : (
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: item.color }} />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x, 90), width - 90);
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 w-[180px] -translate-x-1/2 rounded-[12px] border border-white/[0.1] bg-[#151515]/95 px-3 py-2 text-[12px] text-white/80 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur"
      style={{ left }}
    >
      {children}
    </div>
  );
}

const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 40 };

/** Requests per interval, split into fine (neutral), client errors 4xx (amber) and server errors 5xx (red). */
export function TrafficChart({ series, bucketSeconds }: { series: SeriesPoint[]; bucketSeconds: number }) {
  const [box, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(() => niceMax(Math.max(1, ...series.map((p) => p.requests))), [series]);
  const n = Math.max(series.length, 1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / n;
  const barW = Math.max(1, slot - 2);
  const y = (v: number) => (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(n / 6);

  return (
    <div>
      <Legend
        items={[
          { label: 'Fine', color: STATUS_COLOR.neutral },
          { label: 'Client errors (4xx)', color: STATUS_COLOR.warn },
          { label: 'Server errors (5xx)', color: STATUS_COLOR.error },
        ]}
      />
      <div ref={box} className="relative mt-3" onMouseLeave={() => setHover(null)}>
        <svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Requests over time by outcome">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH - y(t)} y2={PAD.top + plotH - y(t)} stroke="rgba(255,255,255,0.06)" />
              <text x={PAD.left - 8} y={PAD.top + plotH - y(t) + 4} textAnchor="end" fontSize="10.5" fill="rgba(255,255,255,0.35)">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {series.map((p, i) => {
            const x = PAD.left + i * slot + 1;
            const fine = Math.max(0, p.requests - p.errors - p.warnings);
            const segs: Array<[number, string]> = [
              [fine, STATUS_COLOR.neutral],
              [p.warnings, STATUS_COLOR.warn],
              [p.errors, STATUS_COLOR.error],
            ];
            let base = PAD.top + plotH;
            return (
              <g key={p.bucket} opacity={hover === null || hover === i ? 1 : 0.55}>
                {segs.map(([v, color], k) => {
                  if (v <= 0) return null;
                  const h = Math.max(1.5, y(v));
                  const top = base - h;
                  const rect = (
                    <rect
                      key={k}
                      x={x}
                      y={top}
                      width={barW}
                      height={Math.max(0.5, h - (k > 0 ? 1 : 0))}
                      rx={Math.min(2, barW / 2)}
                      fill={color}
                      fillOpacity={k === 0 ? 0.55 : 1}
                    />
                  );
                  base = top - 1;
                  return rect;
                })}
                <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
          {series.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={`l-${p.bucket}`} x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill="rgba(255,255,255,0.35)">
                {bucketLabel(p.bucket, bucketSeconds)}
              </text>
            ) : null
          )}
        </svg>
        {hover !== null && series[hover] ? (
          <Tooltip x={PAD.left + hover * slot + slot / 2} width={width}>
            <p className="font-medium text-white">{bucketLabel(series[hover].bucket, bucketSeconds)}</p>
            <p className="mt-1 flex justify-between">
              <span>Requests</span>
              <span className="tabular-nums">{Math.round(series[hover].requests)}</span>
            </p>
            <p className="flex justify-between">
              <span>Server errors</span>
              <span className="tabular-nums">{series[hover].errors}</span>
            </p>
            <p className="flex justify-between">
              <span>Client errors</span>
              <span className="tabular-nums">{series[hover].warnings}</span>
            </p>
            <p className="flex justify-between">
              <span>Browser errors</span>
              <span className="tabular-nums">{series[hover].client_errors}</span>
            </p>
            <p className="flex justify-between">
              <span>Service failures</span>
              <span className="tabular-nums">{series[hover].upstream_failures}</span>
            </p>
            <p className="flex justify-between">
              <span>p95</span>
              <span className="tabular-nums">{formatMs(series[hover].p95)}</span>
            </p>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

/** p95 response time per interval. One series, so the title names it and there is no legend box. */
export function LatencyChart({ series, bucketSeconds }: { series: SeriesPoint[]; bucketSeconds: number }) {
  const [box, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const values = series.map((p) => p.p95);
  const max = niceMax(Math.max(100, ...values.map((v) => v ?? 0)));
  const n = Math.max(series.length, 1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  // Break the line where an interval had no requests.
  const paths: string[] = [];
  let current = '';
  values.forEach((v, i) => {
    if (v === null) {
      if (current) paths.push(current);
      current = '';
    } else current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (current) paths.push(current);
  const labelEvery = Math.ceil(n / 6);

  return (
    <div
      ref={box}
      className="relative"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const rel = ((e.clientX - rect.left) / rect.width) * width;
        const i = Math.round(((rel - PAD.left) / plotW) * (n - 1));
        setHover(Math.min(Math.max(i, 0), n - 1));
      }}
    >
      <svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Slowest 5% response time over time">
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="rgba(255,255,255,0.35)">
              {t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}s` : `${Math.round(t)}`}
            </text>
          </g>
        ))}
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={STATUS_COLOR.neutral} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {values.map((v, i) =>
          v !== null && (i === 0 || values[i - 1] === null) && (i === n - 1 || values[i + 1] === null) ? (
            <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={STATUS_COLOR.neutral} stroke="#0E0E0E" strokeWidth={2} />
          ) : null
        )}
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
            {values[hover] !== null ? (
              <circle cx={x(hover)} cy={y(values[hover] as number)} r={4.5} fill={STATUS_COLOR.neutral} stroke="#0E0E0E" strokeWidth={2} />
            ) : null}
          </g>
        ) : null}
        {series.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.bucket} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="rgba(255,255,255,0.35)">
              {bucketLabel(p.bucket, bucketSeconds)}
            </text>
          ) : null
        )}
      </svg>
      {hover !== null && series[hover] ? (
        <Tooltip x={x(hover)} width={width}>
          <p className="font-medium text-white">{bucketLabel(series[hover].bucket, bucketSeconds)}</p>
          <p className="mt-1 flex justify-between">
            <span>p95</span>
            <span className="tabular-nums">{values[hover] === null ? 'No requests' : formatMs(values[hover])}</span>
          </p>
          <p className="flex justify-between">
            <span>Requests</span>
            <span className="tabular-nums">{Math.round(series[hover].requests)}</span>
          </p>
        </Tooltip>
      ) : null}
    </div>
  );
}

/** Tiny requests-and-errors bars for a feature card. */
export function Spark({ points, label }: { points: Array<[string, number, number]>; label: string }) {
  const w = 120;
  const h = 28;
  if (points.length === 0) return <div className="h-[28px] w-[120px]" aria-hidden />;
  const max = Math.max(1, ...points.map(([, r]) => r));
  const slot = w / Math.max(points.length, 12);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {points.slice(-Math.floor(w / slot)).map(([b, r, e], i) => {
        const rh = Math.max(1, (r / max) * h);
        const eh = e > 0 ? Math.max(2, (e / max) * h) : 0;
        return (
          <g key={b}>
            <title>{`${new Date(b).toLocaleTimeString()}: ${Math.round(r)} requests, ${e} errors`}</title>
            <rect x={i * slot} y={h - rh} width={Math.max(1, slot - 1)} height={rh} rx={1} fill={STATUS_COLOR.neutral} fillOpacity={0.45} />
            {eh > 0 ? <rect x={i * slot} y={h - eh} width={Math.max(1, slot - 1)} height={eh} rx={1} fill={STATUS_COLOR.error} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

/** One tick per health check over the last 24 hours. */
export function HealthStrip({ history }: { history: Array<[string, 'ok' | 'warn' | 'error']> }) {
  const recent = history.slice(-72);
  if (recent.length === 0) return <span className="text-[11.5px] text-white/30">No checks yet</span>;
  return (
    <div
      className="flex h-4 items-end gap-[2px]"
      role="img"
      aria-label={`Last ${recent.length} checks: ${recent.filter(([, l]) => l !== 'ok').length} not healthy`}
    >
      {recent.map(([at, level]) => (
        <span
          key={at}
          title={`${new Date(at).toLocaleString()}: ${level === 'ok' ? 'healthy' : level === 'warn' ? 'degraded' : 'down'}`}
          className="inline-block w-[3px] rounded-[1px]"
          style={{
            height: level === 'ok' ? 10 : 16,
            background: level === 'ok' ? STATUS_COLOR.ok : level === 'warn' ? STATUS_COLOR.warn : STATUS_COLOR.error,
            opacity: level === 'ok' ? 0.6 : 1,
          }}
        />
      ))}
    </div>
  );
}
