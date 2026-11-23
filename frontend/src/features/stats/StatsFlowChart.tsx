import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FlowRow, FlowSeries } from './statsData';
import { seriesLabel, seriesUnit } from './statsData';

/** 선택 기간 일별 면적 차트(한 계열). 같은 데이터의 표는 호출부가 제공한다. */
export function StatsFlowChart({ rows, series }: { rows: FlowRow[]; series: FlowSeries }) {
  const name = `${seriesLabel[series]} (${seriesUnit[series]})`;
  return (
    <div className="stats-chart">
      <p className="visually-hidden">선택 기간 날짜별 {seriesLabel[series]} 면적 차트. 아래 표에서 같은 수치를 볼 수 있습니다.</p>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id="stats-flow-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6c4fe0" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#6c4fe0" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eceef4" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} minTickGap={24} tick={{ fill: '#6b7085', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#e6e8f0' }} />
          <YAxis allowDecimals={false} width={36} tick={{ fill: '#6b7085', fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => [`${String(value)}${seriesUnit[series]}`, seriesLabel[series]]} labelFormatter={(label) => `${String(label)} (KST)`} />
          <Area type="monotone" dataKey={series} name={name} stroke="#6c4fe0" strokeWidth={2.5} fill="url(#stats-flow-fill)" isAnimationActive={false} dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
