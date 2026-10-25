// マージ済みの PR の手元のブランチを消す。ブランチを切り替えるたびに
// post-checkout のフックが呼ぶ。
//
// ■ なぜ要るか
//   GitHub 側のブランチはマージした時に消える（リポジトリの設定）が、手元の
//   ブランチは残る。PR は自動マージを掛けて CI を待つので、マージの瞬間に手元で
//   消す機会が無い。放っておくと、マージ済みのブランチが毎回十数本溜まっていた。
//
// ■ 何を消すか
//   手元のブランチの先端が、マージ済みの PR に全部入っているものだけ。
//   - PR の先端と同じ → 消す
//   - PR の先端より古い（自動マージ待ちの間に main を取り込まれた等）→ 消す
//   - PR に入っていないコミットがある（マージの後に積んだ）→ 消さない
//   main・staging と、どこかの worktree で開いているブランチは触らない。
//   squash でマージするので `git branch -d` は「マージされていない」と断る。
//   入っていることを上で確かめたうえで -D で消す。
//
// gh が無い・ログインしていない・ネットに出られない時は、何もせず黙って抜ける
// （ブランチの切り替えを止めない）。

import { spawnSync } from "node:child_process";

if (process.env.CI) process.exit(0);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 20_000 });
  return r.status === 0 ? r.stdout : null;
}

const KEEP = new Set(["main", "staging"]);

const refs = run("git", ["for-each-ref", "refs/heads", "--format=%(refname:short) %(objectname)"]);
if (!refs) process.exit(0);
const branches = refs
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split(" "))
  .filter(([name]) => !KEEP.has(name));
if (branches.length === 0) process.exit(0);

const worktrees = run("git", ["worktree", "list", "--porcelain"]) ?? "";
const open = new Set(
  [...worktrees.matchAll(/^branch refs\/heads\/(.+)$/gm)].map((m) => m[1]),
);

const prsJson = run("gh", [
  "pr",
  "list",
  "--state",
  "merged",
  "--limit",
  "200",
  "--json",
  "headRefName,headRefOid",
]);
if (!prsJson) process.exit(0);
const merged = new Map();
for (const pr of JSON.parse(prsJson)) {
  merged.set(pr.headRefName, [...(merged.get(pr.headRefName) ?? []), pr.headRefOid]);
}

// tip が PR の先端に全部入っているか。同じなら即、違えば GitHub で比べる
// （PR の先端は手元に無いことが多い。tip は push 済みなので GitHub にある）。
function containedIn(tip, heads) {
  if (heads.includes(tip)) return true;
  return heads.some((head) => {
    const status = run("gh", [
      "api",
      `repos/{owner}/{repo}/compare/${tip}...${head}`,
      "--jq",
      ".status",
    ])?.trim();
    return status === "ahead" || status === "identical";
  });
}

const removed = [];
for (const [name, tip] of branches) {
  if (open.has(name)) continue;
  const heads = merged.get(name);
  if (!heads || !containedIn(tip, heads)) continue;
  if (run("git", ["branch", "-D", name]) !== null) removed.push(name);
}
if (removed.length > 0) {
  console.log(`マージ済みのブランチを消した: ${removed.join(", ")}`);
}
