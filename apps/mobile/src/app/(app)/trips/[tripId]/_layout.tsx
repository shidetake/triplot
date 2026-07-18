import { Stack } from "expo-router";
import { useRef } from "react";
import { View } from "react-native";

import { CalendarExportSheet } from "@/components/calendar-export-sheet";
import { CategoriesSheet } from "@/components/categories-sheet";
import { EditTripSheet } from "@/components/edit-trip-sheet";
import { ExportSheet } from "@/components/export-sheet";
import { FormSheet, type FormSheetRef } from "@/components/form-sheet";
import { HeaderIconButton } from "@/components/header-icon-button";
import { SettingsIcon, ShareIcon } from "@/components/icons";
import { shareTripInvite } from "@/lib/shareTripInvite";
import { useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 旅行詳細のルート。ヘッダーは親 Stack の1本だけ（戻る + 旅行名 + 共有 + 編集）。
// 共有はこのアプリの肝なのでメニューに埋めず1タップのボタン（web が共有
// アイコン単体を出しているのと同じ）。
// 最初の <Stack.Screen> は自分を内包する親 Stack（(app)/_layout.tsx）の
// この route のオプションを注入する（旅行名が動的なので layout 側に書けない）。
// ネストした Stack 自身はヘッダーを出さない（二重ヘッダー防止）。
//
// 旅行の編集・カテゴリ管理・エクスポート・カレンダーエクスポートは、以前は
// native の formSheet（別ルートへの画面遷移）で実装していたが、地図タブの
// 場所フォームだけ @gorhom ベースのシート（背後の地図の文脈を残す必要が
// あるため native に置き換えられない）を使っており、native と @gorhom が
// 画面ごとに混在していた。ユーザーには「なぜここだけ質感が違うのか」が
// 分からず違和感になる（Slack が PanModal で全モーダルを1つの実装に統一した
// のと同じ理屈）ため、@gorhom ベースの FormSheet に統一した。
//
// 4枚のシート（編集/カテゴリ/エクスポート/カレンダーエクスポート）は
// 論理的にはドリルイン（編集→カテゴリ/エクスポート、エクスポート→
// カレンダー）だが、実装上は互いに兄弟としてここに並べる。子の FormSheet を
// 親の FormSheet の中（BottomSheetScrollView 配下）にネストすると、子の
// enableDynamicSizing の高さ測定が親のレイアウト計算と干渉し、開ききった
// 瞬間に親ごと閉じる @gorhom の既知不具合を踏むため。
//
// 開閉は @gorhom 標準の stackBehavior="push"（FormSheet の子）に任せる。
// push は前のシートを閉じずに裏へ残したまま新しいシートを上に重ねる、
// ドリルイン用に用意された組み込みの挙動（Discord のモーダルスタックと同じ:
// 一番上を閉じれば自動的に1段階下へ戻る）。既定の "switch"（前のシートを
// minimize→このシートが閉じたら restore）は enableDynamicSizing との
// 組み合わせで復元が崩れることがあったため使わない。
export default function TripLayout() {
  const tripId = useTripId();
  const { data } = useTripDetail(tripId);
  const tripTitle = data?.trip?.title ?? "";
  const editRef = useRef<FormSheetRef>(null);
  const categoriesRef = useRef<FormSheetRef>(null);
  const exportRef = useRef<FormSheetRef>(null);
  const calendarExportRef = useRef<FormSheetRef>(null);

  return (
    <>
      <Stack.Screen
        options={{
          title: tripTitle,
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 4 }}>
              <HeaderIconButton
                accessibilityLabel="共有"
                onPress={() => void shareTripInvite(tripId)}
              >
                <ShareIcon size={20} color="#666666" />
              </HeaderIconButton>
              <HeaderIconButton
                accessibilityLabel="旅行を編集"
                onPress={() => editRef.current?.present()}
              >
                <SettingsIcon size={20} color="#666666" />
              </HeaderIconButton>
            </View>
          ),
        }}
      />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>

      <FormSheet ref={editRef} sizeToContent>
        {() => (
          <EditTripSheet
            tripId={tripId}
            onOpenCategories={() => categoriesRef.current?.present()}
            onOpenExport={() => exportRef.current?.present()}
          />
        )}
      </FormSheet>
      {/* カテゴリ管理は extend（部分リフト）。既定の interactive だと、入力行が
          最下段＋シートが背が高い構成で「gorhom の全体持ち上げ」と「UIKit の
          キーボードインセット自動スクロール」が二重に効き、入力欄が画面最上部
          まで飛ぶ（実機・シミュレータで再現）。extend は被る分だけ持ち上げ＋
          不足分だけ最小スクロールなので、入力欄がキーボード直上で止まる。 */}
      <FormSheet
        ref={categoriesRef}
        sizeToContent
        stackBehavior="push"
        keyboardBehavior="extend"
      >
        {() => <CategoriesSheet tripId={tripId} />}
      </FormSheet>
      <FormSheet ref={exportRef} sizeToContent stackBehavior="push">
        {() => (
          <ExportSheet
            tripId={tripId}
            onOpenCalendarExport={() =>
              calendarExportRef.current?.present()
            }
          />
        )}
      </FormSheet>
      <FormSheet
        ref={calendarExportRef}
        sizeToContent
        stackBehavior="push"
      >
        {() => <CalendarExportSheet tripId={tripId} />}
      </FormSheet>
    </>
  );
}
