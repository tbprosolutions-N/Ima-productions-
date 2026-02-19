import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

interface Props {
  data: { monthKey: string; monthLabel: string; income: number; expenses: number }[];
  canSeeMoney: boolean;
}

const FinanceCashFlowChart = React.memo<Props>(({ data, canSeeMoney }) => (
  <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        תזרים מזומנים
      </CardTitle>
      <CardDescription className="text-muted-foreground">
        הכנסות (אירועים שולמו) מול הוצאות לפי חודש בתקופה הנבחרת
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={v => (canSeeMoney ? `₪${(v / 1000).toFixed(0)}K` : '***')} />
            <Tooltip
              formatter={(value: number, name: string) => [canSeeMoney ? formatCurrency(value) : '***', name]}
              labelFormatter={label => `חודש: ${label}`}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
            />
            <Legend wrapperStyle={{ fontSize: '13px' }} />
            <Bar dataKey="income" name="הכנסות" fill="#10B981" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenses" name="הוצאות" fill="#EF4444" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 text-center">
        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
          <p className="text-xs text-green-700 font-medium">סה"כ הכנסות</p>
          <p className="text-lg font-bold text-green-600">{canSeeMoney ? formatCurrency(data.reduce((s: number, d: any) => s + (d.income || 0), 0)) : '***'}</p>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-xs text-red-700 font-medium">סה"כ הוצאות</p>
          <p className="text-lg font-bold text-red-600">{canSeeMoney ? formatCurrency(data.reduce((s: number, d: any) => s + (d.expenses || 0), 0)) : '***'}</p>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs text-blue-700 font-medium">רווח נקי</p>
          <p className="text-lg font-bold text-blue-600">{canSeeMoney ? formatCurrency(data.reduce((s: number, d: any) => s + (d.income || 0) - (d.expenses || 0), 0)) : '***'}</p>
        </div>
      </div>
    </CardContent>
  </Card>
));

export default FinanceCashFlowChart;
