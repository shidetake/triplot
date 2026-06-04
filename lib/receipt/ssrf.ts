// SSRF（Server-Side Request Forgery）対策の IP 判定（純関数・defense-in-depth）。
// fetch プロキシでは「許可ドメインのみ」を主防御にしつつ、解決後の IP がプライベート/
// ループバック/リンクローカル/メタデータ等でないかをここで二重チェックする。

function ipv4Blocked(a: number, b: number): boolean {
  // a,b = 第1・第2オクテット
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local（169.254.169.254 メタデータ含む）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0/24 等（IETF 予約）
  if (a >= 224) return true; // multicast/reserved (224+)
  return false;
}

// IPv4/IPv6 文字列が「内部向け＝fetch 禁止」か。
export function isBlockedIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase();

  // IPv4-mapped IPv6（::ffff:192.168.0.1）は埋め込み IPv4 で判定
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : addr;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const oct = v4.split(".").map(Number);
    if (oct.some((n) => n > 255)) return true; // 不正は弾く
    return ipv4Blocked(oct[0], oct[1]);
  }

  // IPv6
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  if (/^f[cd]/.test(addr)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(addr)) return true; // fe80::/10 link-local
  // 解決できない/未知形式は安全側で弾く
  return !/^[0-9a-f:]+$/.test(addr);
}
