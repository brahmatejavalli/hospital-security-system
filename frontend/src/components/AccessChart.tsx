import { useId, useState } from 'react'
import type { ChartPoint } from '../lib/types'

function smoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return ''
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x},${point.y}`
    const previous = points[index - 1]
    const midpoint = (previous.x + point.x) / 2
    return `${path} C ${midpoint},${previous.y} ${midpoint},${point.y} ${point.x},${point.y}`
  }, '')
}

export function AccessChart({ points }: { points: ChartPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const id = useId().replaceAll(':', '')
  const width = 740,
    height = 235,
    left = 35,
    right = 15,
    top = 18,
    bottom = 34
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom
  const max = Math.max(
    20,
    Math.ceil(Math.max(...points.map(point => point.authorized), 0) / 20) * 20,
  )
  const coords = points.map((point, index) => ({
    x: left + (index / Math.max(points.length - 1, 1)) * plotWidth,
    y: top + plotHeight - (point.authorized / max) * plotHeight,
  }))
  const path = smoothPath(coords)
  const active = hovered !== null ? points[hovered] : null
  return (
    <div className="access-chart" onMouseLeave={() => setHovered(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Daily access activity. ${points.reduce((sum, point) => sum + point.authorized, 0)} authorized events and ${points.reduce((sum, point) => sum + point.blocked, 0)} blocked events.`}
        onMouseMove={event => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const position = ((event.clientX - bounds.left) / bounds.width) * width
          setHovered(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(((position - left) / plotWidth) * (points.length - 1)),
              ),
            ),
          )
        }}
      >
        <defs>
          <pattern id={`area-${id}`} width="7" height="7" patternUnits="userSpaceOnUse">
            <path d="M0 7 7 0" stroke="#d2e7dd" strokeWidth="0.7" />
          </pattern>
        </defs>
        {[0, 1, 2, 3, 4].map(index => {
          const y = top + (index / 4) * plotHeight
          return (
            <g key={index}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="#e9eeeb"
                strokeDasharray={index === 4 ? undefined : '3 5'}
              />
              <text x={left - 12} y={y + 4} textAnchor="end" className="chart-label">
                {max - (index * max) / 4}
              </text>
            </g>
          )
        })}
        {coords.length > 0 && (
          <>
            <path
              d={`${path} L ${coords[coords.length - 1].x},${height - bottom} L ${left},${height - bottom} Z`}
              fill="#edf6f0"
              opacity="0.9"
            />
            <path
              d={`${path} L ${coords[coords.length - 1].x},${height - bottom} L ${left},${height - bottom} Z`}
              fill={`url(#area-${id})`}
            />
            <path d={path} fill="none" stroke="#40896b" strokeWidth="2.7" strokeLinecap="round" />
          </>
        )}
        {points.map(
          (point, index) =>
            point.blocked > 0 && (
              <rect
                key={point.date}
                x={coords[index].x - 3}
                y={height - bottom - Math.max(7, (point.blocked / max) * plotHeight)}
                width="6"
                height={Math.max(7, (point.blocked / max) * plotHeight)}
                rx="2"
                fill="#deb574"
              />
            ),
        )}
        {points.map(
          (point, index) =>
            (points.length <= 7 ||
              index === 0 ||
              index === points.length - 1 ||
              index % Math.ceil(points.length / 6) === 0) && (
              <text
                key={point.date}
                x={coords[index].x}
                y={height - 9}
                textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
                className="chart-label"
              >
                {new Intl.DateTimeFormat(
                  'en-GB',
                  points.length <= 7
                    ? { weekday: 'short', timeZone: 'UTC' }
                    : { day: 'numeric', month: 'short', timeZone: 'UTC' },
                ).format(new Date(point.date + 'T12:00:00Z'))}
              </text>
            ),
        )}
        {hovered !== null && coords[hovered] && (
          <g>
            <line
              x1={coords[hovered].x}
              x2={coords[hovered].x}
              y1={top}
              y2={height - bottom}
              stroke="#6b9e85"
              strokeDasharray="3 3"
            />
            <circle
              cx={coords[hovered].x}
              cy={coords[hovered].y}
              r="5"
              fill="#fff"
              stroke="#40896b"
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>
      {active && hovered !== null && (
        <div
          className="chart-tooltip"
          style={{ left: `${Math.max(14, Math.min(83, (coords[hovered].x / width) * 100))}%` }}
        >
          <strong>
            {new Date(active.date + 'T12:00:00Z').toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            })}
          </strong>
          <span>
            <i />
            {active.authorized} authorized
          </span>
          <span>
            <i className="blocked-dot" />
            {active.blocked} blocked
          </span>
        </div>
      )}
    </div>
  )
}
