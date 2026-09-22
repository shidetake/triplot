// Google のプロフィール写真が「本人が設定した写真」か「Google が生成した
// 既定の画像」かを判定する。
//
// Google は写真を設定していないアカウントにも、頭文字入りの色付き丸を**画像として**
// 返す。URL の形は本物の写真と同じで、中身を見ないと区別できない（実測: 生成画像は
// 739 バイトの PNG、本物は 5.8KB の JPEG だったが、これは経験則でしかない）。
//
// People API は写真ごとに `default` フラグを返す。これが唯一の正式な判定手段。
// 必要なスコープは userinfo.profile で、サインイン時に既に付与されているため、
// 同意画面の変更も再同意も発生しない。
//
// 判定できなかった時は null を返す（呼び出し側は何もしない）。サインインの経路に
// 置くものなので、ここで失敗してもサインインを止めないため。
const PEOPLE_API =
  "https://people.googleapis.com/v1/people/me?personFields=photos";

const TIMEOUT_MS = 3000;

type PeopleResponse = {
  photos?: { url?: string; default?: boolean }[];
};

export async function isGoogleDefaultPhoto(
  accessToken: string,
): Promise<boolean | null> {
  // AbortSignal.timeout は React Native に無いことがあるので自前で組む。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PEOPLE_API, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PeopleResponse;
    const photo = body.photos?.[0];
    if (!photo) return null;
    // 本物の写真では default 自体が返ってこない。
    return photo.default === true;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
