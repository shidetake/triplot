import AsyncStorage from "@react-native-async-storage/async-storage";

// カレンダーの「誰の時計で見るか」の案内を、その人が一度でも見たか。
//
// **端末に置けば足りる**（DB に持たない）。これは操作の記録ではなく手がかりで、
// 消えても最悪もう一度出るだけ。機種を変えたらもう一度出るのはむしろ正しい。
const KEY = "triplot.viewerTipSeen";

export async function viewerTipSeen(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === "1";
}

export async function markViewerTipSeen(): Promise<void> {
  await AsyncStorage.setItem(KEY, "1");
}
