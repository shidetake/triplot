// 為替レートの表示用丸め。
//
// 市場慣行（pip ルール）は「クォート通貨の桁数」依存＝メジャーペア4桁・JPY ペア2桁。
// これは「クォート通貨1単位あたりの大きさ」で最適桁数が変わるという話なので、
// 有効数字で丸めれば桁数が値の大きさに自動追従し、通貨表を持たずに同等の結果になる:
//   148.33333  → 148.33   （JPY ペア相当＝2桁）
//   1.082540   → 1.0825   （メジャーペア相当＝4桁）
//   0.0067340  → 0.006734 （小さい値は桁を増やして精度維持）
// 既定 5 有効数字。末尾ゼロは落とす（toPrecision → Number で正規化）。
export function formatRate(value: number, sigFigs = 5): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toPrecision(sigFigs)));
}
