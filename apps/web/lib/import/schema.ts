import { z } from "zod";

// 取り込みメールから LLM で抽出する構造化データの契約（Zod スキーマ）。
// 費用（Receipt）と予定（EventDraft）の両方をここで定義する。
// プロバイダ非依存：AI SDK の generateObject にこのスキーマを渡し、Claude /
// Gemini / OpenAI / ローカル のどれでも同じ型で受け取る。
//
// category は trip ごとの expense_categories（既定の 11 個）に合わせた正規名で
// LLM に選ばせ、後段（取り込み確定時）でその trip の category_id に名前で対応づける。
// 既定カテゴリ: seed_default_expense_categories と一致させること。

export const RECEIPT_CATEGORIES = [
  "渡航",
  "現地移動",
  "飲食",
  "衣服",
  "エンタメ",
  "土産",
  "宿泊",
  "通信",
  "医療",
  "カジノ",
  "その他",
] as const;

export const receiptSchema = z.object({
  merchant: z
    .string()
    .describe("店舗・サービス名。例: Uber / KAI COFFEE ALOHILANI。不明なら空文字"),
  total: z
    .number()
    .describe("合計（支払）金額の数値のみ。通貨記号・桁区切りは含めない"),
  currency: z
    .string()
    .describe("ISO 4217 の通貨コード（大文字3字）。例: $ → USD、¥ → JPY"),
  date: z
    .string()
    .describe(
      "支払った日（取引日）。YYYY-MM-DD。店頭購入では利用日と同じ。カード確定日・請求日ではない。年が無ければ文脈/受信年で補う",
    ),
  serviceDate: z
    .string()
    .nullable()
    .describe(
      "航空券の搭乗日・宿泊のチェックイン日など、購入日と別に『実際に使う日』がある場合のみ YYYY-MM-DD。店頭購入など該当しなければ null",
    ),
  time: z
    .string()
    .nullable()
    .describe(
      "レシートに購入時刻が記載されていれば HH:MM（24時間）。現地の壁時計の時刻をそのまま。不明なら null",
    ),
  category: z
    .enum(RECEIPT_CATEGORIES)
    .describe("最も近いカテゴリを1つ。判断できなければ「その他」"),
  location: z
    .string()
    .nullable()
    .describe(
      "実際に利用した店舗・施設の住所や地名（場所の手がかり）。無ければ null。運送会社" +
        "（航空会社・鉄道会社等）のチケット購入では、その会社の支社・本社住所を入れない" +
        "（利用者が実際に訪れる場所ではないため）",
    ),
  // マージ用（決済元を問わない汎用フィールド）。
  referenceId: z
    .string()
    .nullable()
    .describe(
      "取引を識別する番号があれば（承認番号・取引ID・注文番号・確認番号など、決済元・カード会社・サービスを問わない）。無ければ null",
    ),
  isUpdate: z
    .boolean()
    .describe(
      "このメールが既存決済の確定・更新・差額調整の通知（pending→確定、金額の更新/調整など）なら true。新規の購入レシートなら false",
    ),
});

export type Receipt = z.infer<typeof receiptSchema>;

// 予定の下書き。kind は EventForm の3種別（Kind3）と同じ:
//   transit = タイムゾーン跨ぎの移動（フライト等）。出発/到着の壁時計 + 実IANA TZ
//   allday  = 終日・複数日（宿泊のチェックイン〜チェックアウト等）。TZ 無関係
//   timed   = 時刻のある通常の予定（レストラン予約・アクティビティ等）
// 時刻は現地の壁時計をそのまま持つ（events の floating time モデルと一致）。
// timed/allday の TZ は旅程から自動導出されるので持たない（transit のみ）。
export const eventDraftSchema = z.object({
  kind: z
    .enum(["timed", "allday", "transit"])
    .describe(
      "予定の種別。transit=タイムゾーンを跨ぐ移動（フライト等）、allday=終日・複数日（宿泊のチェックイン〜チェックアウト等）、timed=時刻のある通常の予定（レストラン予約・アクティビティ等）",
    ),
  title: z
    .string()
    .describe(
      "予定の見出し。フライトは空港コードの区間表記（例: NRT-HNL）、宿泊は施設名、レストラン・アクティビティは店名/名称",
    ),
  startDate: z
    .string()
    .describe(
      "開始日（transit は出発日、宿泊はチェックイン日）。YYYY-MM-DD、現地の日付。年が無ければ文脈/受信日から補う",
    ),
  startTime: z
    .string()
    .nullable()
    .describe(
      "開始時刻（transit は出発時刻）。HH:MM 24時間、現地の壁時計のまま（タイムゾーン変換しない）。終日・不明は null",
    ),
  endDate: z
    .string()
    .nullable()
    .describe(
      "終了日（transit は到着日〔到着地の現地日付。日付変更線を跨ぐと出発日より前になり得る〕、宿泊はチェックアウト日）。YYYY-MM-DD。開始と同日・不明は null（transit では必須）",
    ),
  endTime: z
    .string()
    .nullable()
    .describe("終了時刻（transit は到着時刻）。HH:MM、現地の壁時計。不明は null"),
  departTz: z
    .string()
    .nullable()
    .describe(
      "transit のみ: 出発地の IANA タイムゾーン名（例: Asia/Tokyo。空港・都市名から推定する）。transit 以外は null",
    ),
  arriveTz: z
    .string()
    .nullable()
    .describe(
      "transit のみ: 到着地の IANA タイムゾーン名（例: Pacific/Honolulu）。transit 以外は null",
    ),
  vehicleNumber: z
    .string()
    .nullable()
    .describe(
      "transit のみ: 便名・列車番号など交通機関の識別番号（例: NH184、のぞみ23号）。判明すれば入れる。transit 以外・不明は null",
    ),
  departTerminal: z
    .string()
    .nullable()
    .describe(
      "transit のみ: 出発地のターミナル表記（例: Terminal 1、T2）。メールに明記が無くても、" +
        "航空会社と空港の一般的な組み合わせ（どの航空会社がどのターミナルを使うか）から確信を" +
        "持って推定できるなら入れてよい。根拠が薄い/不明なら null。transit 以外は null",
    ),
  arriveTerminal: z
    .string()
    .nullable()
    .describe(
      "transit のみ: 到着地のターミナル表記（例: Terminal B）。departTerminal と同じ基準で、" +
        "航空会社・空港からの推定可。根拠が薄い/不明なら null。transit 以外は null",
    ),
  departLocation: z
    .string()
    .nullable()
    .describe(
      "transit のみ: 出発地の空港・駅名（地図で一意に検索できる正式名称。例: 成田国際空港、" +
        "ダニエル・K・イノウエ国際空港。空港コードや都市名だけにしない）。到着地ではない。" +
        "transit 以外・不明は null",
    ),
  arriveLocation: z
    .string()
    .nullable()
    .describe(
      "transit のみ: 到着地の空港・駅名（departLocation と同じ形式）。出発地ではない。" +
        "transit 以外・不明は null",
    ),
  location: z
    .string()
    .nullable()
    .describe(
      "timed/allday のみ: 施設・店の場所の手がかり（住所・地名。地図で検索できる形が望ましい）。" +
        "transit は departLocation/arriveLocation を使うのでここは null。無ければ null",
    ),
  referenceId: z
    .string()
    .nullable()
    .describe("予約番号・確認番号など予約を識別する番号。無ければ null"),
  isUpdate: z
    .boolean()
    .describe(
      "既存予約の変更・確定・リマインダーの通知なら true。新規予約の確認なら false",
    ),
});

export type EventDraft = z.infer<typeof eventDraftSchema>;

// 1メールの抽出結果（inbound_emails.extracted の形）。金額のないメール（旅程・
// リマインダー等）は receipt が null、予定のないメール（店頭レシート等）は events が空。
export type Extraction = {
  receipt: Receipt | null;
  events: EventDraft[];
};

// 第2パス enrichment（未許可ホストのリンク先を fetch して再抽出）が実際に下書きの
// 内容を補えたか。false なら「LLM が detailUrl を報告したが実質的な収穫は無かった」
// ＝配信解除リンクの誤報告・fetch できただけで空のページ等のノイズなので、候補ホストの
// 学習（receipt_link_candidates）には記録しない（admin 管理ページに出るのは実際に
// 役立ったホストだけにする）。
export function extractionGainedDetail(
  before: Extraction,
  after: Extraction,
): boolean {
  if (!before.receipt && after.receipt) return true;
  if (before.receipt && after.receipt) {
    const b = before.receipt;
    const a = after.receipt;
    if (!b.merchant && a.merchant) return true;
    if (b.total === 0 && a.total !== 0) return true;
    if (!b.location && a.location) return true;
    if (!b.referenceId && a.referenceId) return true;
    if (!b.serviceDate && a.serviceDate) return true;
    if (!b.time && a.time) return true;
  }
  if (after.events.length > before.events.length) return true;
  return false;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^(\d{1,2}):(\d{2})$/;

function validYmd(s: string | null): s is string {
  if (!s || !YMD_RE.test(s)) return false;
  return !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

// "H:MM"/"HH:MM" → "HH:MM"（24時間・ゼロ埋め）。不正は null。
function validHm(s: string | null): string | null {
  const m = s?.match(HM_RE);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// LLM の出力する TZ 名は幻覚しうるので実在検証し、あわせて Intl の正規化
// （JST→Asia/Tokyo、US/Hawaii→Pacific/Honolulu 等）を通した canonical IANA 名を返す。
// 不正（実在しない）は null。
export function canonicalTimeZone(tz: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

// LLM 出力の EventDraft を検証・補正する（純関数）。使えない下書きは null（捨てる）。
//  - startDate が不正なら捨てる（日付の無い予定は置けない）
//  - 時刻/TZ は形式・実在を検証し、不正は null に落とす（フォームで人が直す）
//  - kind の整合を補正: transit は到着（日時）が揃わなければ timed/allday に降格、
//    timed は開始時刻が無ければ allday に降格。allday は時刻を持たない
//  - transit 以外は TZ・便名・ターミナル・出発/到着地を持たない（events の参照化モデルと一致）
//    ／ transit は逆に汎用 location を持たない（departLocation/arriveLocation を使う）
//  - transit の到着は出発より現地日付が前になり得る（日付変更線）ので順序は縛らない。
//    timed/allday は終了 >= 開始 を要求し、破れば終了を落とす
export function sanitizeEventDraft(d: EventDraft): EventDraft | null {
  if (!validYmd(d.startDate)) return null;
  const title = d.title.trim();
  const startTime = validHm(d.startTime);
  const endDate = validYmd(d.endDate) ? d.endDate : null;
  const endTime = validHm(d.endTime);
  const departTz = d.departTz ? canonicalTimeZone(d.departTz) : null;
  const arriveTz = d.arriveTz ? canonicalTimeZone(d.arriveTz) : null;

  let kind = d.kind;
  if (kind === "transit" && (!startTime || !endTime || !endDate)) {
    kind = startTime ? "timed" : "allday";
  }
  if (kind === "timed" && !startTime) kind = "allday";

  const base = {
    title,
    referenceId: d.referenceId,
    isUpdate: d.isUpdate,
  };
  if (kind === "transit") {
    return {
      ...base,
      kind,
      startDate: d.startDate,
      startTime,
      endDate,
      endTime,
      departTz,
      arriveTz,
      vehicleNumber: d.vehicleNumber,
      departTerminal: d.departTerminal,
      arriveTerminal: d.arriveTerminal,
      departLocation: d.departLocation,
      arriveLocation: d.arriveLocation,
      location: null,
    };
  }
  // timed/allday: 終了 >= 開始（壁時計）を要求。破れば終了を落とす。
  let end = endDate && endDate < d.startDate ? null : endDate;
  let endT = kind === "timed" ? endTime : null;
  if (kind === "timed" && endT && (end ?? d.startDate) === d.startDate) {
    if (startTime && endT < startTime) endT = null;
  }
  if (kind === "allday" && end === d.startDate) end = null;
  return {
    ...base,
    kind,
    startDate: d.startDate,
    startTime: kind === "timed" ? startTime : null,
    endDate: end,
    endTime: endT,
    departTz: null,
    arriveTz: null,
    vehicleNumber: null,
    departTerminal: null,
    arriveTerminal: null,
    departLocation: null,
    arriveLocation: null,
    location: d.location,
  };
}
