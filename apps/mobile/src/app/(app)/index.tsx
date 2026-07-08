import { Redirect } from "expo-router";

// アプリのホーム = 旅行一覧（web の /trips と同じ IA）。
export default function Home() {
  return <Redirect href="/trips" />;
}
