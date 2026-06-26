import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Area, AreaChart } from 'recharts'

export interface GrowthPoint {
  date: string
  views: number
  likes?: number
}

export function GrowthChart({
  data,
  type = 'area',
  height = 240,
}: {
  data: GrowthPoint[]
  type?: 'area' | 'line'
  height?: number
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
        Pas encore de données — lance un scrape pour démarrer la courbe.
      </div>
    )
  }

  const tooltipStyle = {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  }

  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#374151' }} />
          <Line type="monotone" dataKey="views" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Vues" />
          {data[0]?.likes !== undefined && (
            <Line type="monotone" dataKey="likes" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} name="Likes" />
          )}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#374151' }} />
        <Area type="monotone" dataKey="views" stroke="#8b5cf6" strokeWidth={2} fill="url(#viewsGrad)" name="Vues" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
