interface SummaryCardsProps {
  total: number;
  includes: number;
  excludes: number;
  maybes: number;
}

const formatter = new Intl.NumberFormat('en-US');

export function SummaryCards({ total, includes, excludes, maybes }: SummaryCardsProps) {
  const items = [
    { label: 'Total records', value: formatter.format(total) },
    { label: 'Includes', value: formatter.format(includes) },
    { label: 'Excludes', value: formatter.format(excludes) },
    { label: 'Maybes', value: formatter.format(maybes) },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
