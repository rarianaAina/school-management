import { useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/formatters'

/**
 * Palette catégorielle en ordre fixe, jamais recyclée.
 *
 * Les valeurs viennent des tokens --chart-* validés par le script du référentiel
 * dataviz (bande de clarté, plancher de chroma, séparation daltonisme, plancher
 * de vision normale). Le rouge et l'ambre en sont absents à dessein : ils
 * portent les états (retard, alerte, échec) et ne doivent jamais servir de
 * simple « série n ».
 */
const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const AXIS_STYLE = {
  stroke: 'var(--border)',
  fontSize: 11,
  tick: { fill: 'var(--muted-foreground)' },
}

interface ChartFrameProps {
  title: string
  description?: string
  children: ReactNode
  /** Vue tableau : exigée dès qu'une teinte passe sous 3:1 de contraste. */
  table: { columns: string[]; rows: Array<Array<string | number>> }
  height?: number
}

function ChartFrame({ title, description, children, table, height = 240 }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTable((current) => !current)}
          aria-pressed={showTable}
        >
          <Table2 className="size-4" />
          {showTable ? 'Graphique' : 'Données'}
        </Button>
      </CardHeader>
      <CardContent>
        {showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  {table.columns.map((column, index) => (
                    <th
                      key={column}
                      className={index === 0 ? 'py-1.5 text-left font-medium' : 'py-1.5 text-right font-medium'}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {table.rows.map((row) => (
                  <tr key={String(row[0])}>
                    {row.map((cell, index) => (
                      <td
                        key={index}
                        className={
                          index === 0 ? 'py-1.5' : 'tabular py-1.5 text-right text-muted-foreground'
                        }
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              {children as React.ReactElement}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const tooltipStyle = {
  contentStyle: {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--popover-foreground)',
  },
  labelStyle: { color: 'var(--foreground)', fontWeight: 500 },
}

// -----------------------------------------------------------------------------
// Effectifs par niveau — deux séries comparables, donc légende obligatoire.
// -----------------------------------------------------------------------------
export function EnrollmentChart({
  data,
}: {
  data: Array<{ level: string; students: number; capacity: number }>
}) {
  return (
    <ChartFrame
      title="Effectifs par niveau"
      description="Inscrits face aux places disponibles."
      table={{
        columns: ['Niveau', 'Inscrits', 'Capacité'],
        rows: data.map((row) => [row.level, row.students, row.capacity]),
      }}
    >
      <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="level" {...AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis {...AXIS_STYLE} tickLine={false} axisLine={false} width={40} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'var(--accent)', opacity: 0.4 }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="students" name="Inscrits" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28}>
          <LabelList
            dataKey="students"
            position="top"
            style={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
        </Bar>
        <Bar dataKey="capacity" name="Capacité" fill={SERIES[3]} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartFrame>
  )
}

// -----------------------------------------------------------------------------
// Recettes mensuelles — une seule série : pas de légende, le titre la nomme.
// -----------------------------------------------------------------------------
export function RevenueChart({
  data,
  currency,
}: {
  data: Array<{ month: string; amount: number }>
  currency: string
}) {
  const formatted = data.map((row) => ({
    ...row,
    label: new Date(row.month).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
  }))

  return (
    <ChartFrame
      title="Recettes encaissées"
      description={`Évolution mensuelle, en ${currency}.`}
      table={{
        columns: ['Mois', 'Montant'],
        rows: formatted.map((row) => [row.label, formatNumber(row.amount, 0)]),
      }}
    >
      <AreaChart data={formatted} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          {...AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) =>
            value >= 1_000_000
              ? `${(value / 1_000_000).toFixed(1)}M`
              : value >= 1000
                ? `${Math.round(value / 1000)}k`
                : String(value)
          }
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(value) => [formatNumber(Number(value), 0), 'Encaissé']}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#revenue-fill)"
          dot={{ r: 3, strokeWidth: 0, fill: 'var(--chart-1)' }}
          activeDot={{ r: 5, stroke: 'var(--background)', strokeWidth: 2 }}
        />
      </AreaChart>
    </ChartFrame>
  )
}

// -----------------------------------------------------------------------------
// Répartition des moyennes — une série, la tranche sous le seuil est signalée
// par une couleur d'état, jamais par une couleur catégorielle.
// -----------------------------------------------------------------------------
export function GradeDistributionChart({
  data,
  passingScore,
  scale,
}: {
  data: Array<{ range: string; students: number }>
  passingScore: number
  scale: number
}) {
  const step = scale / 5

  return (
    <ChartFrame
      title="Répartition des moyennes"
      description={`Nombre d'élèves par tranche, sur ${scale}. Seuil de réussite : ${passingScore}.`}
      table={{
        columns: ['Tranche', 'Élèves'],
        rows: data.map((row) => [row.range, row.students]),
      }}
    >
      <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="range" {...AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis {...AXIS_STYLE} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'var(--accent)', opacity: 0.4 }} />
        <Bar dataKey="students" name="Élèves" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.map((row, index) => (
            <Cell
              key={row.range}
              fill={(index + 1) * step <= passingScore ? 'var(--destructive)' : 'var(--chart-2)'}
            />
          ))}
          <LabelList
            dataKey="students"
            position="top"
            style={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

// -----------------------------------------------------------------------------
// Assiduité par classe
// -----------------------------------------------------------------------------
export function AttendanceChart({
  data,
}: {
  data: Array<{ name: string; rate: number; absences: number }>
}) {
  return (
    <ChartFrame
      title="Assiduité par classe"
      description="Taux de présence moyen constaté sur les séances appelées."
      table={{
        columns: ['Classe', 'Assiduité (%)', 'Absences'],
        rows: data.map((row) => [row.name, formatNumber(row.rate, 1), row.absences]),
      }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 40, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} {...AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          {...AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={90}
        />
        <Tooltip
          {...tooltipStyle}
          cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
          formatter={(value) => [`${formatNumber(Number(value), 1)} %`, 'Assiduité']}
        />
        <Bar dataKey="rate" name="Assiduité" fill={SERIES[1]} radius={[0, 4, 4, 0]} maxBarSize={20}>
          <LabelList
            dataKey="rate"
            position="right"
            formatter={(value: unknown) => `${formatNumber(Number(value), 1)} %`}
            style={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}
