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
// 開閉は「子を開く時に親を明示的に dismiss()、子が閉じたら onDismiss で親を
// 明示的に present()」で自前制御する（@gorhom の BottomSheetModal 既定の
// stackBehavior="switch"＝前のシートを自動で minimize/restore する仕組みには
// 乗らない）。乗ると常に1つのシートしか「presented」にならないので、
// enableDynamicSizing との組み合わせでの復元崩れを避けられ、かつ「子を
// 閉じたら必ず1段階親に戻る」という意図をコードから直接読める形にできる。
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
        {(dismiss) => (
          <EditTripSheet
            tripId={tripId}
            onDone={dismiss}
            onOpenCategories={() => {
              editRef.current?.dismiss();
              categoriesRef.current?.present();
            }}
            onOpenExport={() => {
              editRef.current?.dismiss();
              exportRef.current?.present();
            }}
          />
        )}
      </FormSheet>
      <FormSheet
        ref={categoriesRef}
        sizeToContent
        onDismiss={() => editRef.current?.present()}
      >
        {(_dismiss, scrollToEnd) => (
          <CategoriesSheet tripId={tripId} scrollToEnd={scrollToEnd} />
        )}
      </FormSheet>
      <FormSheet
        ref={exportRef}
        sizeToContent
        onDismiss={() => editRef.current?.present()}
      >
        {() => (
          <ExportSheet
            tripId={tripId}
            onOpenCalendarExport={() => {
              exportRef.current?.dismiss();
              calendarExportRef.current?.present();
            }}
          />
        )}
      </FormSheet>
      <FormSheet
        ref={calendarExportRef}
        sizeToContent
        onDismiss={() => exportRef.current?.present()}
      >
        {() => <CalendarExportSheet tripId={tripId} />}
      </FormSheet>
    </>
  );
}
