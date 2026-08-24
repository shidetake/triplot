// triplot アイコン
//
//   ・正方形全体を1つの三角形分割で覆い、T の輪郭を拘束辺として埋め込む（CDT）。
//     T の輪郭は「内側の三角形と外側の三角形が共有する辺」になる。
//   ・T の輪郭は **8 本の直線** として定義する。歪ませるのは各直線の
//     「角度」と「平行移動」だけで、角はその交点として求める。
//     → 各辺は定義上つねに完全な直線。垂直・水平からだけ外れる。
//     （頂点を個別に動かすとガタガタの折れ線になるので、その方式は採らない）
//   ・角丸は焼き込まない（iOS/Android が自前でマスクをかけるため）。
import { writeFileSync } from "node:fs";

/* ---------- OKLCH → hex ---------- */
function lin2srgb(c) {
  c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return "#" + [r, g, bb].map(lin2srgb).map((v) => v.toString(16).padStart(2, "0")).join("");
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 幾何 ---------- */
const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function properIntersect(p1, p2, p3, p4) {
  const d1 = cross2(p3, p4, p1), d2 = cross2(p3, p4, p2);
  const d3 = cross2(p1, p2, p3), d4 = cross2(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
const triArea = (a, b, c) => Math.abs(cross2(a, b, c)) / 2;

// 点群の最小包含円（点数が20程度なので総当たりで十分）。
// Android のセーフゾーンは「円」なので、外接矩形ではなくこれを基準に置くと
// 同じ安全度でマークを一番大きく取れる。
function minEnclosingCircle(pts) {
  const inside = (c, p) => Math.hypot(p[0] - c.x, p[1] - c.y) <= c.r + 1e-6;
  let best = null;
  const consider = (c) => {
    if (!c) return;
    if (pts.every((p) => inside(c, p)) && (!best || c.r < best.r)) best = c;
  };
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      consider({
        x: (pts[i][0] + pts[j][0]) / 2,
        y: (pts[i][1] + pts[j][1]) / 2,
        r: Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) / 2,
      });
    }
  }
  if (best) return best;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      for (let k = j + 1; k < pts.length; k++) {
        const cc = circumcircle(pts[i], pts[j], pts[k]);
        if (cc) consider({ x: cc.x, y: cc.y, r: Math.sqrt(cc.r2) });
      }
  return best;
}

/* ---------- Delaunay ---------- */
function circumcircle(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { x: ux, y: uy, r2: (a[0] - ux) ** 2 + (a[1] - uy) ** 2 };
}
function delaunay(pts) {
  const n = pts.length, big = 1e5;
  const all = [...pts, [-big, -big], [big, -big], [0, big]];
  let tris = [[n, n + 1, n + 2]];
  for (let i = 0; i < n; i++) {
    const p = all[i];
    const bad = [], good = [];
    for (const t of tris) {
      const cc = circumcircle(all[t[0]], all[t[1]], all[t[2]]);
      if (cc && (p[0] - cc.x) ** 2 + (p[1] - cc.y) ** 2 < cc.r2) bad.push(t); else good.push(t);
    }
    const edges = new Map();
    for (const t of bad) {
      for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const k = u < v ? `${u},${v}` : `${v},${u}`;
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
    }
    for (const [k, c] of edges) {
      if (c !== 1) continue;
      const [u, v] = k.split(",").map(Number);
      good.push([u, v, i]);
    }
    tris = good;
  }
  return tris.filter((t) => t.every((i) => i < n));
}

/* ---------- 拘束辺の埋め込み ---------- */
const ekey = (u, v) => (u < v ? `${u},${v}` : `${v},${u}`);
function trianglesByEdge(tris) {
  const map = new Map();
  tris.forEach((t, i) => {
    for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const k = ekey(u, v);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
  });
  return map;
}
function insertConstraint(tris, pts, ia, ib) {
  const hasEdge = () => tris.some((t) => t.includes(ia) && t.includes(ib));
  if (hasEdge()) return true;
  const crossing = [], seen = new Set();
  for (const t of tris) {
    for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      if (u === ia || u === ib || v === ia || v === ib) continue;
      const k = ekey(u, v);
      if (seen.has(k)) continue;
      if (properIntersect(pts[ia], pts[ib], pts[u], pts[v])) { seen.add(k); crossing.push([u, v]); }
    }
  }
  let guard = crossing.length * 40 + 200;
  while (crossing.length && guard-- > 0) {
    const [u, v] = crossing.shift();
    const owners = trianglesByEdge(tris).get(ekey(u, v));
    if (!owners || owners.length !== 2) continue;
    const [i1, i2] = owners;
    const p = tris[i1].find((x) => x !== u && x !== v);
    const q = tris[i2].find((x) => x !== u && x !== v);
    if (p === undefined || q === undefined) continue;
    if (!properIntersect(pts[u], pts[v], pts[p], pts[q])) { crossing.push([u, v]); continue; }
    tris[i1] = [p, q, u];
    tris[i2] = [p, q, v];
    if (p !== ia && p !== ib && q !== ia && q !== ib &&
        properIntersect(pts[ia], pts[ib], pts[p], pts[q])) crossing.push([p, q]);
  }
  return hasEdge();
}

/* ---------- T を「8本の直線」として定義する ---------- */
const S = 1024;
// 元画像の実測比率 × 1024 が、歪ませる前の理想の T。
// 各直線は「通過点」と「角度（度・0=水平, 90=垂直）」で持つ。
// 並び順は輪郭を一周する順で、角 i = 直線 i と 直線 i+1 の交点。
// 歪ませてよいのは warp: true の3本だけ＝T の中で最も短い直線（端の小口）。
// 長辺（横棒の上・両下辺・縦棒の左右）は水平/垂直のまま動かさない。
// こうすると横棒の太さも縦棒の幅も一定に保たれ、傾くのは端の小口だけになる。
const T_LINES = [
  { name: "横棒の上",       p: [500, 148], a: 0,  warp: false }, // 長さ 711
  { name: "横棒の右",       p: [869, 232], a: 90, warp: true  }, // 長さ 168 ← 最短級
  { name: "横棒の下(右)",   p: [734, 316], a: 0,  warp: false }, // 長さ 270
  { name: "縦棒の右",       p: [599, 610], a: 90, warp: false }, // 長さ 587
  { name: "縦棒の下",       p: [512, 903], a: 0,  warp: true  }, // 長さ 173 ← 最短級
  { name: "縦棒の左",       p: [426, 610], a: 90, warp: false }, // 長さ 587
  { name: "横棒の下(左)",   p: [292, 316], a: 0,  warp: false }, // 長さ 268
  { name: "横棒の左",       p: [158, 232], a: 90, warp: true  }, // 長さ 168 ← 最短級
];

function intersect(l1, l2) {
  const d1 = [Math.cos(l1.rad), Math.sin(l1.rad)];
  const d2 = [Math.cos(l2.rad), Math.sin(l2.rad)];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  const dx = l2.q[0] - l1.q[0], dy = l2.q[1] - l1.q[1];
  const t = (dx * d2[1] - dy * d2[0]) / den;
  return [l1.q[0] + d1[0] * t, l1.q[1] + d1[1] * t];
}

/**
 * @param tiltDeg 各直線の角度の振れ幅（度）。0 で完全な T。
 * @param shiftPx 各直線の平行移動の振れ幅（px @1024）。
 */
// tilts は warp: true の3本それぞれの傾き（度・符号付き）
// [横棒の右, 縦棒の下, 横棒の左]。乱数ではなく明示的に指定する
// （どの向きにどれだけ倒すかは選択であって偶然ではない）。
function makeCorners(tilts, shiftPx) {
  let wi = 0;
  const lines = T_LINES.map((L) => {
    let t = 0, s = 0;
    if (L.warp) { t = tilts[wi]; s = Math.sign(tilts[wi]) * shiftPx; wi++; }
    const rad = ((L.a + t) * Math.PI) / 180;
    // 法線方向に平行移動する
    const n = [-Math.sin(rad), Math.cos(rad)];
    return { rad, q: [L.p[0] + n[0] * s, L.p[1] + n[1] * s] };
  });
  return lines.map((_, i) => intersect(lines[i], lines[(i + 1) % lines.length]));
}

// 角の間に、その辺の上にぴったり乗る点を足す（辺は直線のまま・三角形は増える）
function densify(corners, spacing = 280) {
  const out = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    out.push([...a]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / spacing));
    for (let m = 1; m <= k; m++) {
      const t = m / (k + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/* ---------- 点を置く ---------- */
function buildPoints(seed, outline, meshN) {
  const rnd = mulberry32(seed + 101);
  const all = outline.map((p) => [...p]);
  const outlineCount = all.length;
  const cols = meshN, rows = meshN;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const p = [
        (i / cols) * S + (rnd() - 0.5) * (S / cols) * 0.85,
        (j / rows) * S + (rnd() - 0.5) * (S / rows) * 0.85,
      ];
      if (pointInPolygon(p, outline)) continue;
      let near = false;
      for (let k = 0; k < outlineCount; k++) {
        if (distToSegment(p, all[k], all[(k + 1) % outlineCount]) < 62) { near = true; break; }
      }
      if (near) continue;
      all.push(p);
    }
  }
  const M = 95;
  for (let k = 0; k <= 6; k++) {
    const t = (k / 6) * S;
    all.push([t, -M], [t, S + M], [-M, t], [S + M, t]);
  }
  all.push([-M, -M], [S + M, -M], [-M, S + M], [S + M, S + M]);
  return { pts: all, outlineCount };
}

/* ---------- 組み立て ---------- */
function build({ seed = 12, rounded = false, greyTop = 0.93, greySpan = 0.09,
                 shiftPx = 0, tilts = [12, 12, 12], markOnly = false,
                 hideT = false, silhouette = false, androidLayer = null,
                 safeFit = false, fgLayer = false, tScale = 1, tDy = 0, meshN = 6,
                 markL0 = 0.86, markLSpan = 0.39, strokeL = 0.55 } = {}) {
  let corners = makeCorners(tilts, shiftPx);
  // 余白の微調整。tScale で T 全体を縮め（上下左右の余白が増える）、
  // tDy で下へずらす（上の余白だけが増える）。中心は T の外接矩形の中心。
  if (tScale !== 1 || tDy !== 0) {
    const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    corners = corners.map(([x, y]) => [
      cx + (x - cx) * tScale,
      cy + (y - cy) * tScale + tDy,
    ]);
  }
  // Android のアダプティブアイコン用: T の最小包含円がセーフゾーン
  // （108dp 中 66dp）に一致するよう T ごと縮小・中央寄せしてから
  // **その位置で三角形分割をやり直す**。背景と前景を同じ分割から切り出すので、
  // 2枚のレイヤーを重ねると iOS 版と同じ「輪郭は共有辺」の絵になる。
  if (safeFit) {
    const mec = minEnclosingCircle(corners);
    const k = (S * (66 / 108)) / 2 / mec.r;
    corners = corners.map(([x, y]) => [S / 2 + (x - mec.x) * k, S / 2 + (y - mec.y) * k]);
  }
  const outline = densify(corners, safeFit ? 180 : 280);
  const T_PATH = "M" + outline.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L") + " Z";
  const { pts, outlineCount } = buildPoints(seed, outline, meshN);
  const tris = delaunay(pts);

  const failed = [];
  for (let i = 0; i < outlineCount; i++) {
    if (insertConstraint(tris, pts, i, (i + 1) % outlineCount) === false) failed.push(i);
  }

  const rnd = mulberry32(seed * 977 + 13);
  const GREY_SHAPE = [0, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.70, 0.85, 1.0];
  const greys = GREY_SHAPE.map((t) => oklch(greyTop - t * greySpan, 0, 0));
  const stroke = oklch(0.63, 0.012, 193);

  const inside = [], outside = [];
  let degenerate = 0;
  const isInside = tris.map((t) => {
    const P = t.map((i) => pts[i]);
    if (triArea(P[0], P[1], P[2]) < 25) degenerate++;
    const c = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3];
    const inT = pointInPolygon(c, outline);
    (inT ? inside : outside).push({ P, c });
    return inT;
  });

  const shared = [];
  for (let i = 0; i < outlineCount; i++) {
    const a = i, b = (i + 1) % outlineCount;
    const owners = tris.map((t, k) => (t.includes(a) && t.includes(b) ? k : -1)).filter((k) => k >= 0);
    shared.push({
      edge: i,
      ok: owners.filter((k) => isInside[k]).length === 1 && owners.filter((k) => !isInside[k]).length === 1,
    });
  }

  const poly = (P) => P.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const bg = outside
    .map(({ P }) => `<polygon points="${poly(P)}" fill="${greys[Math.floor(rnd() * greys.length)]}"/>`)
    .join("\n      ");
  // hideT: T の内側も地と同じ灰色で塗る（Android のアダプティブアイコンの
  // 背景レイヤー用。前景レイヤーの T と重ねて1枚の絵になる）
  const fg = inside
    .map(({ P, c }) => {
      if (hideT) return `<polygon points="${poly(P)}" fill="${greys[Math.floor(rnd() * greys.length)]}"/>`;
      const d = (c[0] / S) * 0.5 + (c[1] / S) * 0.5;
      return `<polygon points="${poly(P)}" fill="${oklch(markL0 - d * markLSpan, 0.055, 188 + d * 17)}"/>`;
    })
    .join("\n      ");

  // T の外接矩形（切り出し用）
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const pad = 6;
  const bx = Math.min(...xs) - pad, by = Math.min(...ys) - pad;
  const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const vb = `${bx.toFixed(1)} ${by.toFixed(1)} ${bw.toFixed(1)} ${bh.toFixed(1)}`;

  // Android の前景レイヤー: 分割はそのままに、T の三角形だけを透明地に描く。
  // 背景レイヤー（hideT）と同じ分割なので、重ねると継ぎ目なく一致する。
  if (fgLayer) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <g stroke="${oklch(strokeL, 0.02, 196)}" stroke-width="2.6" stroke-linejoin="round">
    ${fg}
  </g>
  <path d="${T_PATH}" fill="none" stroke="${oklch(strokeL - 0.05, 0.025, 196)}" stroke-width="3.2" stroke-linejoin="round"/>
</svg>`,
      stats: { total: tris.length, inside: inside.length, outside: outside.length, failed, shared, degenerate },
    };
  }

  // Android のモノクロレイヤー: T の輪郭だけを単色で塗る（分割線なし）。
  // themed icon では OS が単色で塗り直すので、階調は持たせられない。
  if (silhouette) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <path d="${T_PATH}" fill="#000000"/>
</svg>`,
      stats: { total: tris.length, inside: inside.length, outside: outside.length, failed, shared, degenerate },
    };
  }

  // スプラッシュ / Android の前景レイヤー用: T だけを透明地に描き、外接矩形で切り出す
  if (markOnly) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${Math.round(bw)}" height="${Math.round(bh)}">
  <g stroke="${oklch(strokeL, 0.02, 196)}" stroke-width="2.6" stroke-linejoin="round">
    ${fg}
  </g>
  <path d="${T_PATH}" fill="none" stroke="${oklch(strokeL - 0.05, 0.025, 196)}" stroke-width="3.2" stroke-linejoin="round"/>
</svg>`,
      stats: { total: tris.length, inside: inside.length, outside: outside.length, failed, shared, degenerate },
    };
  }

  const clipRect = rounded
    ? `<rect width="${S}" height="${S}" rx="230" ry="230"/>`
    : `<rect width="${S}" height="${S}"/>`;

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <defs><clipPath id="mask">${clipRect}</clipPath></defs>
  <g clip-path="url(#mask)">
    <rect width="${S}" height="${S}" fill="${greys[2]}"/>
    <g stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round">
      ${bg}
    </g>
    <g stroke="${oklch(0.55, 0.02, 196)}" stroke-width="2.6" stroke-linejoin="round">
      ${fg}
    </g>
    ${hideT ? "" : `<path d="${T_PATH}" fill="none" stroke="${oklch(0.5, 0.025, 196)}" stroke-width="3.2" stroke-linejoin="round"/>`}
  </g>
</svg>`,
    stats: { total: tris.length, inside: inside.length, outside: outside.length, failed, shared, degenerate },
  };
}


/* ---------- 出力 ---------- */
// 確定した仕様。値を変えたい時はここだけ触る。
//   tilts   最短の3本（横棒の左右の小口・縦棒の足）の傾き。3本とも同符号＝
//           右に倒れる平行四辺形。長辺は水平・垂直のまま動かさない。
//   greySpan 地の階調の幅。狭いほど背景に落ちる。
//   tScale  T を 5% 縮めて余白を稼ぐ（上148/下103 → 上167/下122）。
//   tDy     T を下へずらす量。T は横棒に質量が集中した top-heavy な字形で、
//           外接矩形を中央に置くと上に寄って見える（実測: インクの重心は
//           キャンバス中心より 99.5px 上）。ただし重心を中心に合わせる
//           （＝約100px下げる）と縦棒の足が下端に接して破綻するので、
//           文字の常として重心センタリングは使わない。値は目視で決めた:
//           現状+0/+10/+20/+30/+40 の5案を iOS 相当の連続角丸でマスクし、
//           ラベルを伏せてランダムに並べて選んでもらった結果 +20。
//           結果の余白は上186/下100。
//   meshN   地のメッシュ。4×4 で地の三角形の平均が T の内側の 0.80 倍になる
//           （6×6 だと 0.53 倍で、地のほうが目に見えて細かかった）。
const FINAL = { tilts: [12, 12, 12], greyTop: 0.93, greySpan: 0.09, tScale: 0.95, tDy: 20, meshN: 4 };

// スプラッシュのダークは地が #0a0a0a（lib/theme.ts の dark.background）なので、
// 色相ランプはそのままに明度だけ持ち上げる。
const DARK_MARK = { markL0: 0.88, markLSpan: 0.26, strokeL: 0.72 };

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "apps/mobile/assets/images");
const tmp = mkdtempSync(join(tmpdir(), "triplot-icon-"));

// SVG → PNG。rsvg-convert（描画）と magick（アルファ除去・メタデータ除去）が要る。
//   brew install librsvg imagemagick
function png(svg, dest, { width, height, opaque = false }) {
  const src = join(tmp, "in.svg");
  const mid = join(tmp, "out.png");
  writeFileSync(src, svg);
  execFileSync("rsvg-convert", [
    "-w", String(width), ...(height ? ["-h", String(height)] : []), src, "-o", mid,
  ]);
  execFileSync("magick", [
    mid,
    ...(opaque ? ["-background", "white", "-alpha", "remove", "-alpha", "off"] : []),
    "-colorspace", "sRGB", "-strip", join(out, dest),
  ]);
}

const app = build({ ...FINAL });
const mark = build({ ...FINAL, markOnly: true });
const markDark = build({ ...FINAL, markOnly: true, ...DARK_MARK });
const andBg = build({ ...FINAL, safeFit: true, hideT: true });
const andFg = build({ ...FINAL, safeFit: true, fgLayer: true });
const andMono = build({ ...FINAL, safeFit: true, silhouette: true });

// iOS / 共通のアプリアイコン。角丸もアルファも持たせない（OS が自前でマスクを
// かけるので、角丸済みの画像を渡すとマスクの内側に地の角が残る）。
png(app.svg, "icon.png", { width: 1024, height: 1024, opaque: true });

// スプラッシュ。imageWidth: 76pt に対する 3x。
png(mark.svg, "splash-icon.png", { width: 228 });
png(markDark.svg, "splash-icon-dark.png", { width: 228 });

// Android のアダプティブアイコン。背景と前景は同じ三角形分割から切り出して
// いるので、重ねると iOS 版と同じ絵になる。
png(andBg.svg, "android-icon-background.png", { width: 512, height: 512, opaque: true });
png(andFg.svg, "android-icon-foreground.png", { width: 512, height: 512 });
png(andMono.svg, "android-icon-monochrome.png", { width: 512, height: 512 });

rmSync(tmp, { recursive: true, force: true });

// 検証: T の輪郭が「内側の三角形1枚 + 外側の三角形1枚」に共有されているか。
// ここが崩れると、T が分割の一部ではなく上に貼った図形になる。
const bad = app.stats.shared.filter((s) => !s.ok);
console.log(`三角形 ${app.stats.total} 枚（T の内側 ${app.stats.inside} / 外側 ${app.stats.outside}）`);
console.log(`輪郭 ${app.stats.shared.length} 辺  共有できていない辺 ${bad.length}  つぶれた三角形 ${app.stats.degenerate}`);
if (bad.length || app.stats.degenerate || app.stats.failed.length) {
  console.error("検証に失敗しました");
  process.exitCode = 1;
} else {
  console.log(`書き出し先: ${out}`);
}
