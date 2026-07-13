import { File, Paths } from "expo-file-system";
import { Share } from "react-native";

// 生成したテキスト（KML / CSV）をキャッシュに書き出して iOS 共有シートで
// 渡す（web の downloadBlob に相当。モバイルの「ダウンロード」= 共有シート
// からファイルに保存 / AirDrop / 他アプリへ）。
export async function exportFileViaShareSheet(
  filename: string,
  content: string,
): Promise<void> {
  const file = new File(Paths.cache, filename);
  // 同名の前回エクスポートが残っていても write が丸ごと上書きする。
  file.write(content);
  await Share.share({ url: file.uri });
}

// ファイル名に使えない文字を落とす（web の safeTitle と同じ変換）。
export function safeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "_").trim() || "trip";
}
