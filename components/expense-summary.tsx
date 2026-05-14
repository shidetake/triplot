import type { ExchangeRates } from "@/lib/currency";
import type { ExpenseSummary } from "@/lib/expenseSummary";
import type { Settlement } from "@/lib/settlement";
import type { Currency } from "@/lib/types/database";

type Member = {
  id: string;
  display_name: string;
};

export function ExpenseSummaryView({
  summary,
  settlements,
  members,
  defaultCurrency,
  rates,
}: {
  summary: ExpenseSummary;
  settlements: Settlement[];
  members: Member[];
  defaultCurrency: Currency;
  rates: ExchangeRates;
}) {
  const memberById = new Map(members.map((m) => [m.id, m]));

  const rateHints = Object.entries(rates)
    .filter(([c]) => c !== defaultCurrency)
    .map(([c, r]) => `1 ${c} = ${r} ${defaultCurrency}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 rounded-md border border-zinc-200 bg-white p-4 text-sm">
        <SummaryCell label="共有での自己負担" value={summary.sharedSelfShare} currency={defaultCurrency} />
        <SummaryCell label="プライベート合計" value={summary.privateTotal} currency={defaultCurrency} />
        <SummaryCell label="合計" value={summary.total} currency={defaultCurrency} emphasized />
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm">
        <h3 className="font-medium">精算</h3>
        {settlements.length === 0 ? (
          <p className="mt-2 text-zinc-500">精算は不要です。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {settlements.map((s, i) => (
              <li key={i} className="text-zinc-700">
                <span className="font-medium">
                  {memberById.get(s.fromMemberId)?.display_name ?? "?"}
                </span>
                <span className="mx-1 text-zinc-400">→</span>
                <span className="font-medium">
                  {memberById.get(s.toMemberId)?.display_name ?? "?"}
                </span>
                <span className="ml-2">{formatAmount(s.amount, defaultCurrency)}</span>
              </li>
            ))}
          </ul>
        )}
        {rateHints.length > 0 && (
          <p className="mt-3 text-xs text-zinc-500">
            換算レート: {rateHints.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  currency,
  emphasized,
}: {
  label: string;
  value: number;
  currency: Currency;
  emphasized?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={emphasized ? "mt-1 text-lg font-semibold" : "mt-1 font-medium"}>
        {formatAmount(value, currency)}
      </div>
    </div>
  );
}

function formatAmount(amount: number, currency: Currency): string {
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  });
  return formatter.format(amount);
}
