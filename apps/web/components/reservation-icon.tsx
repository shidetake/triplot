// 「要予約」マーク。Material Symbols の confirmation_number（チケット）を
// 黄色(amber)で。絵文字 🎫 をやめてアイコン体系に揃えつつ、チケット色に近い
// 黄色で色による視認性も保つ。fill は currentColor＝text-amber-500 で着色。
export function ReservationIcon({
  size = 12,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      className={["inline-block shrink-0 align-middle text-yellow-400", className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <path d="M480-283q12 0 21-9t9-21q0-12-9-21t-21-9q-12 0-21 9t-9 21q0 12 9 21t21 9Zm0-167q12 0 21-9t9-21q0-12-9-21t-21-9q-12 0-21 9t-9 21q0 12 9 21t21 9Zm0-167q12 0 21-9t9-21q0-12-9-21t-21-9q-12 0-21 9t-9 21q0 12 9 21t21 9Zm340 457H140q-25 0-42.5-17.5T80-220v-153q37-8 61.5-37.5T166-480q0-40-24.5-70T80-587v-153q0-25 17.5-42.5T140-800h680q25 0 42.5 17.5T880-740v153q-37 7-61.5 37T794-480q0 40 24.5 69.5T880-373v153q0 25-17.5 42.5T820-160Z" />
    </svg>
  );
}
