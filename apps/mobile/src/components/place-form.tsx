import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";

import {
  createPlace,
  deletePlace,
  updatePlace,
} from "@triplot/shared/data/places";
import { getIconPath } from "@triplot/shared/placeIcons";
import type { PlaceCandidate } from "@triplot/shared/placesSearch";
import { candidateToCreatePlace } from "@triplot/shared/placesSearch";
import type { PlaceRow } from "@triplot/shared/tripDerive";
import type { Visibility } from "@triplot/shared/types/database";

import { TrashIcon } from "./icons";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import Svg, { Path } from "react-native-svg";

// 場所の追加/編集フォーム（RN・M5）。新規は検索候補(PlaceCandidate)または
// 地図長押しの仮ピン(pinDraft=座標のみ・名前は自由入力)から、編集は保存済み
// (PlaceRow)から。アイコン・未確定・公開範囲・メモを編集し、
// shared の createPlace/updatePlace/deletePlace を呼ぶ。
export function PlaceForm({
  tripId,
  pinKeys,
  candidate,
  pinDraft,
  editPlace,
  myMemberId,
  onDone,
}: {
  tripId: string;
  // 選べるピンアイコンのキー（trip_pin_options 由来）。
  pinKeys: string[];
  candidate?: PlaceCandidate;
  // 地図長押しで置いた仮ピンの座標（web の draft ピンと同じ）。
  pinDraft?: { lat: number; lng: number };
  editPlace?: PlaceRow;
  myMemberId: string;
  onDone: () => void;
}) {
  const t = useTranslations("place");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isEdit = !!editPlace;
  const name = editPlace?.name ?? candidate?.name ?? "";
  // 仮ピンは名前を自由入力（web の「ピンを設定」と同じ）。
  const [pinName, setPinName] = useState("");

  const [icon, setIcon] = useState(editPlace?.icon ?? pinKeys[0] ?? "pin");
  const [tentative, setTentative] = useState(editPlace?.tentative ?? false);
  const [visibility, setVisibility] = useState<Visibility>(
    editPlace?.visibility ?? "shared",
  );
  const [note, setNote] = useState(editPlace?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete =
    isEdit &&
    (editPlace!.visibility === "private"
      ? editPlace!.created_by_member_id === myMemberId
      : true);

  const submit = async () => {
    if (pinDraft && !pinName.trim()) {
      setError(`${t("placeholderName")}?`);
      return;
    }
    setBusy(true);
    setError(null);
    const result =
      isEdit && editPlace
        ? await updatePlace(supabase, editPlace.id, {
            tentative,
            visibility,
            note: note.trim(),
            icon,
          })
        : candidate
          ? await createPlace(
              supabase,
              tripId,
              {
                ...candidateToCreatePlace(candidate, {
                  tentative,
                  visibility,
                  icon,
                }),
                note: note.trim(),
              },
            )
          : pinDraft
            ? await createPlace(supabase, tripId, {
                name: pinName.trim(),
                tentative,
                visibility,
                note: note.trim(),
                googlePlaceId: "", // 自由ピンは Google 由来ではない（DB 側 nullif）
                lat: pinDraft.lat,
                lng: pinDraft.lng,
                formattedAddress: "",
                icon,
                region: "",
                locality: "",
              })
            : { ok: false as const, error: "no input" };
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
  };

  const onDelete = () => {
    if (!editPlace) return;
    Alert.alert(t("deleteTitle"), undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          void deletePlace(supabase, editPlace.id).then((r) => {
            if (!r.ok) {
              Alert.alert(t("deleteFailed", { error: r.error }));
              return;
            }
            onDone();
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.content}>
      {pinDraft ? (
        // 仮ピン: 名前を自由入力（placeholder 規約「ピンの場所名 = 集合場所」）。
        <TextInput
          value={pinName}
          onChangeText={setPinName}
          placeholder={t("placeholderName")}
          placeholderTextColor={theme.subtleForeground}
          style={[styles.input, styles.nameInput]}
          autoFocus
        />
      ) : (
        <Text style={styles.name}>{name || t("unknownName")}</Text>
      )}
      {candidate?.formattedAddress ? (
        <Text style={styles.address}>{candidate.formattedAddress}</Text>
      ) : null}

      {/* アイコン選択 */}
      <View style={styles.iconRow}>
        {pinKeys.map((key) => {
          const on = key === icon;
          return (
            <Pressable
              key={key}
              onPress={() => setIcon(key)}
              style={[styles.iconChip, on && styles.iconChipOn]}
            >
              <Svg viewBox="0 -960 960 960" width={20} height={20}>
                <Path
                  d={getIconPath(key)}
                  fill={on ? theme.primaryForeground : theme.mutedForeground}
                />
              </Svg>
            </Pressable>
          );
        })}
      </View>

      {/* ステータス（確定 / 候補） */}
      <View style={styles.inlineRow}>
        <Text style={styles.label}>{t("status")}</Text>
        {([false, true] as const).map((v) => (
          <Pressable
            key={String(v)}
            onPress={() => setTentative(v)}
            style={styles.radioRow}
          >
            <View style={[styles.radio, tentative === v && styles.radioOn]} />
            <Text style={styles.radioLabel}>
              {v ? t("statusCandidate") : t("statusConfirmed")}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 公開範囲 */}
      <View style={styles.inlineRow}>
        <Text style={styles.label}>{t("visibility")}</Text>
        {(["shared", "private"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setVisibility(v)}
            style={styles.radioRow}
          >
            <View
              style={[styles.radio, visibility === v && styles.radioOn]}
            />
            <Text style={styles.radioLabel}>
              {v === "shared"
                ? t("visibilityShared")
                : t("visibilitySelfOnly")}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* メモ */}
      <View>
        <Text style={styles.label}>{t("memo")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t("placeholderMemo")}
          placeholderTextColor={theme.subtleForeground}
          style={styles.input}
        />
      </View>

      {/* フッター */}
      <View style={styles.footer}>
        {canDelete && (
          <Pressable
            onPress={onDelete}
            style={styles.deleteButton}
            accessibilityLabel="削除"
          >
            <TrashIcon size={18} color={theme.destructiveText} />
          </Pressable>
        )}
        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          style={[styles.submitButton, busy && styles.disabled]}
        >
          <Text style={styles.submitLabel}>
            {isEdit ? "保存" : t("addPlaceAria")}
          </Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 14 },
    name: { fontSize: 18, fontWeight: "600", color: t.foreground },
    nameInput: { fontSize: 16 },
    address: { fontSize: 13, color: t.mutedForeground, marginTop: -6 },
    iconRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    iconChip: {
      width: 40,
      height: 40,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      alignItems: "center",
      justifyContent: "center",
    },
    iconChipOn: { backgroundColor: t.primary, borderColor: t.primary },
    inlineRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    label: { fontSize: 13, fontWeight: "500", color: t.foreground },
    radioRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    radio: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: t.fgAlpha(0.35),
    },
    radioOn: { borderWidth: 5, borderColor: t.primary },
    radioLabel: { fontSize: 13, color: t.foreground },
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      marginTop: 4,
      color: t.foreground,
    },
    footer: { flexDirection: "row", gap: 8, marginTop: 4 },
    deleteButton: {
      width: 44,
      height: 44,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.destructiveBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    submitButton: {
      flex: 1,
      height: 44,
      borderRadius: 6,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    submitLabel: {
      color: t.primaryForeground,
      fontSize: 15,
      fontWeight: "500",
    },
    disabled: { opacity: 0.5 },
    error: {
      fontSize: 13,
      color: t.errorText,
      backgroundColor: t.errorBg,
      borderRadius: 6,
      padding: 10,
    },
  });
