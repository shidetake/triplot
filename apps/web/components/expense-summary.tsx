import { getTranslations } from "next-intl/server";

import type { ExpenseSummary } from "@triplot/shared/expenseSummary";
import type { Settlement } from "@triplot/shared/settlement";
import type { Currency } from "@triplot/shared/types/database";
import { formatAmount } from "@triplot/shared/formatAmount";
import { formatRate } from "@triplot/shared/formatRate";

type Member = {
  id: string;
  display_name: string;
};

export async function ExpenseSummaryView({
  summary,
  settlements,
  members,
  defaultCurrency,
  averageRates,
}: {
  summary: ExpenseSummary;
  settlements: Settlement[];
  members: Member[];
  defaultCurrency: Currency;
  averageRates: Partial<Record<Currency, number>>;
}) {
  const t = await getTranslations("tripDetail");
  const memberById = new Map(members.map((m) => [m.id, m]));

  const rateHints = Object.entries(averageRates)
    .filter(([c]) => c !== defaultCurrency)
    .map(([c, r]) => `1 ${c} ≈ ${formatRate(r as number)} ${defaultCurrency}`);

  return (
    <div className="space-y-4">
      {/* 2つの合計は対等（どちらも見出しの数字）なので同じ大きさで並べる。
          プライベートを含むかどうかはラベルの括弧書きで示す。 */}
      <div className="grid grid-cols-2 gap-2 rounded-md border border-foreground/10 bg-background p-4 text-sm">
        <SummaryCell
          label={t("expenseSummaryPersonalTotal")}
          value={summary.personalTotal}
          currency={defaultCurrency}
        />
        <SummaryCell
          label={t("expenseSummaryTripTotal")}
          value={summary.tripTotal}
          currency={defaultCurrency}
        />
      </div>

      <div className="rounded-md border border-foreground/10 bg-background p-4 text-sm">
        <h3 className="font-medium">{t("expenseSummarySettlement")}</h3>
        {settlements.length === 0 ? (
          <p className="mt-2 text-muted-foreground">—</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {settlements.map((s, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-medium">
                  {memberById.get(s.fromMemberId)?.display_name ?? "?"}
                </span>
                <span className="mx-1 text-subtle-foreground">→</span>
                <span className="font-medium">
                  {memberById.get(s.toMemberId)?.display_name ?? "?"}
                </span>
                <span className="ml-2">
                  {formatAmount(s.amount, defaultCurrency)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {rateHints.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("expenseSummaryAverageRate", { rates: rateHints.join(", ") })}
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
}: {
  label: string;
  value: number;
  currency: Currency;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {formatAmount(value, currency)}
      </div>
    </div>
  );
}
