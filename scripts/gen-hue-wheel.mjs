// docs/assets/hue-wheel.svg を生成する。
//
// 図に描く色は **アプリが実際に使う色**（colorRoles.ts の役割ラダー）から取る。
// 図だけ別の式で塗ると、ラダーを変えたときに図と実物がズレる。
//
//   node scripts/gen-hue-wheel.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { roleColor } from "../packages/shared/src/colorRoles.ts";
import { GREEN_HUE } from "../packages/shared/src/eventColor.ts";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/assets/hue-wheel.svg",
);

const SIZE = 480;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUT = 165;
const R_IN = 120;
const R_MARK = 142.5; // リングの中心（マーカーを置く半径）
const R_LABEL = 183;

// 図の角度: 0° を右、反時計回り（数学の慣習）。SVG は y が下向きなので反転する。
const pos = (deg, r) => [
  CX + r * Math.cos((deg * Math.PI) / 180),
  CY - r * Math.sin((deg * Math.PI) / 180),
];

// 目盛りの色名。OKLCH の色相環での見え方（L=.62 / C=.14 で描いたときの実物）。
const TICKS = [
  [0, "ピンク赤"],
  [30, "赤"],
  [60, "オレンジ"],
  [90, "黄土"],
  [120, "黄緑"],
  [150, "緑"],
  [180, "青緑"],
  [210, "シアン"],
  [240, "青"],
  [270, "青紫"],
  [300, "紫"],
  [330, "マゼンタ"],
];

// 挿入順のメンバー色（farthest-point 配置の実際の出力）。
const MEMBERS = [
  [(GREEN_HUE + 180) % 360, "1"],
  [(GREEN_HUE + 270) % 360, "2"],
  [(GREEN_HUE + 90) % 360, "3"],
  [(GREEN_HUE + 315) % 360, "4"],
];

const arcs = [];
for (let h = 0; h < 360; h += 3) {
  const [x1, y1] = pos(h, R_OUT);
  // 隣の扇と少し重ねる（継ぎ目の白い筋を消す）。
  const [x2, y2] = pos(h + 3.4, R_OUT);
  const [x3, y3] = pos(h + 3.4, R_IN);
  const [x4, y4] = pos(h, R_IN);
  const fill = roleColor(h, "solid").light;
  arcs.push(
    `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R_OUT} ${R_OUT} 0 0 0 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${R_IN} ${R_IN} 0 0 1 ${x4.toFixed(2)} ${y4.toFixed(2)} Z" fill="${fill}"/>`,
  );
}

const ticks = TICKS.flatMap(([deg, name]) => {
  const [x, y] = pos(deg, R_LABEL);
  return [
    `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="13" fill="#3f3f46" text-anchor="middle" dominant-baseline="middle">${deg}°</text>`,
    `<text x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" font-size="12" fill="#71717a" text-anchor="middle" dominant-baseline="middle">${name}</text>`,
  ];
});

const members = MEMBERS.flatMap(([deg, label]) => {
  const [x, y] = pos(deg, R_MARK);
  const c = roleColor(deg, "surface").light;
  const fg = roleColor(deg, "onSurface").light;
  return [
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="${c}" stroke="#111" stroke-width="1.8"/>`,
    `<text x="${x.toFixed(1)}" y="${(y + 1).toFixed(1)}" font-size="13" font-weight="bold" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${label}</text>`,
  ];
});

const [gx, gy] = pos(GREEN_HUE, R_MARK);
// 引き出し線の先。角度で伸ばすと GREEN_HUE 次第で図の外へ出るので固定位置に置く。
const [lx, ly] = [74, 86];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" font-family="system-ui, sans-serif">
<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>
${arcs.join("")}
${ticks.join("\n")}
${members.join("\n")}
<text x="288.4" y="449.5" font-size="12" fill="#3f3f46" text-anchor="middle">メンバー色 ①②③④</text>
<text x="288.4" y="464.5" font-size="11" fill="#71717a" text-anchor="middle">＝挿入順・空いた隙間へ</text>
<line x1="${gx.toFixed(1)}" y1="${gy.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#111" stroke-width="1"/>
<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="12" fill="#fff" stroke="#111" stroke-width="2.5"/>
<text x="${gx.toFixed(1)}" y="${(gy + 1).toFixed(1)}" font-size="14" text-anchor="middle" dominant-baseline="middle">★</text>
<text x="${lx.toFixed(1)}" y="${(ly - 6).toFixed(1)}" font-size="13" font-weight="bold" fill="#111" text-anchor="middle">確定 / 全員参加</text>
<text x="${lx.toFixed(1)}" y="${(ly + 10).toFixed(1)}" font-size="12" fill="#111" text-anchor="middle">${GREEN_HUE}° に固定予約</text>
<text x="${CX}" y="${CY - 4}" font-size="13" fill="#52525b" text-anchor="middle">色相環</text>
<text x="${CX}" y="${CY + 14}" font-size="11" fill="#a1a1aa" text-anchor="middle">OKLCH hue 0–359°</text>
</svg>
`;

writeFileSync(OUT, svg);
console.log(`wrote ${OUT}`);
