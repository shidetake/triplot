import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import {
  acquireNoteLock,
  createNote,
  deleteNoteReturning,
  releaseNoteLock,
  renewNoteLock,
  restoreNote,
  saveNote,
  type NoteVisibility,
} from "@triplot/shared/data/notes";
import {
  deriveNotes,
  NOTE_LOCK_RENEW_MS,
  noteSegments,
  type NoteRow,
} from "@triplot/shared/notes";

import { toast } from "@/components/toast";
import { VisibilitySegment } from "@/components/visibility-segment";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useUndoable } from "@/lib/undoable";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";
import { useTripIdParam } from "@/lib/useTripIdParam";

// ノートを開く画面。旅行の画面のノートのタブから push する（?tripId=&noteId=、
// noteId 無しは新しいノート）。ノートは長い文章を読み書きする行き先なので、
// シートで重ねずに画面ごと切り替える（iOS のメモ帳と同じ。ui-guidelines
// 「全画面表示を使う場面」）。どの画面からでも開けるようルート階層に置く。
// web の components/note-editor.tsx と同じ動き:
//   - 表示中と編集中の2つのモード。表示中はリンクを押せば Safari、
//     それ以外を押せばロックを取って編集に入る（iOS のメモ帳と同じ）
//   - 戻る（画面を離れる）＝保存。保存ボタンは置かない
//   - 編集中は期限付きのロックを延ばし続け、他の人が取ったら知らせる
export default function NoteRoute() {
  const tripId = useTripIdParam();
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const { data, me } = useTripDetail(tripId);
  const theme = useTheme();
  if (!data?.trip || !me) return null;
  const note = noteId
    ? (deriveNotes(data.notesRaw).find((n) => n.id === noteId) ?? null)
    : null;
  if (noteId && !note) return null;
  const nameOf = (id: string) =>
    data.members?.find((m) => m.id === id)?.display_name ?? "";
  return (
    <ScrollView
      // 末尾を書いている時にキーボードの裏に隠れないよう、フォーカス中の
      // 入力をキーボードの上まで送る（SheetScroll と同じ設定）。
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingBottom: 24 }}
      // 画面ごと push するので、地の色は自分で塗る（塗らないとスタックの
      // 既定の灰色が出る）。
      style={{ backgroundColor: theme.background }}
    >
      <NoteEditor
        tripId={tripId}
        note={note}
        myMemberId={me.id}
        nameOf={nameOf}
      />
    </ScrollView>
  );
}

type Session = {
  // 書き込み先。新しいノートは作った時点で id を持つ。
  noteId: string | null;
  body: string;
  visibility: NoteVisibility;
  token: string | null;
  original: { body: string; visibility: NoteVisibility };
  lost: boolean;
};

function NoteEditor({
  tripId,
  note,
  myMemberId,
  nameOf,
}: {
  tripId: string;
  note: NoteRow | null;
  myMemberId: string;
  nameOf: (memberId: string) => string;
}) {
  const t = useTranslations("notes");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const invalidate = useInvalidateTrip(tripId);
  const runUndoable = useUndoable(invalidate);

  const [noteId, setNoteId] = useState<string | null>(note?.id ?? null);
  const [editing, setEditing] = useState(note === null);
  const [body, setBody] = useState(note?.body ?? "");
  const [visibility, setVisibility] = useState<NoteVisibility>(
    note?.visibility ?? "shared",
  );
  const [original, setOriginal] = useState({
    body: note?.body ?? "",
    visibility: note?.visibility ?? ("shared" as NoteVisibility),
  });
  const [token, setToken] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 離れた（画面が外れた）時点の中身を書き込むため、最新を控えておく。
  const session = useRef<Session>({
    noteId,
    body,
    visibility,
    token,
    original,
    lost,
  });
  useEffect(() => {
    session.current = { noteId, body, visibility, token, original, lost };
  });

  const copyAction = (text: string) => ({
    label: t("copy"),
    onPress: () => {
      void Clipboard.setStringAsync(text).then(() => toast(t("copied")));
    },
  });

  // 書き込む。戻った時と、アプリが裏に回った時（強制終了で書きかけが
  // 消えないように）に呼ぶ。新しく作ったら id を返す。
  const persist = async (s: Session): Promise<string | null> => {
    const changed =
      s.body !== s.original.body || s.visibility !== s.original.visibility;
    if (s.noteId === null) {
      if (s.body.trim() === "") return null;
      const r = await createNote(supabase, tripId, s.body, s.visibility);
      if (!r.ok) toast(t("failed", { error: r.error }), copyAction(s.body));
      void invalidate();
      return r.ok ? r.data : null;
    }
    if (s.token === null) return null;
    if (s.lost) {
      if (changed) toast(t("saveLost"), copyAction(s.body));
      return null;
    }
    // 空にして戻ったら消す（iOS のメモ帳と同じ）。ロックは自分が持っているので消せる。
    if (s.body.trim() === "") {
      await releaseNoteLock(supabase, s.noteId, s.token);
      const id = s.noteId;
      runUndoable({
        apply: () => deleteNoteReturning(supabase, id),
        restore: (snapshot) => restoreNote(supabase, snapshot),
        done: t("deleted"),
        failed: (error) => t("failed", { error }),
      });
      return null;
    }
    if (!changed) {
      await releaseNoteLock(supabase, s.noteId, s.token);
      void invalidate();
      return null;
    }
    const r = await saveNote(supabase, s.noteId, s.token, s.body, s.visibility);
    if (!r.ok) toast(t("failed", { error: r.error }), copyAction(s.body));
    else if (!r.data) toast(t("saveLost"), copyAction(s.body));
    void invalidate();
    return null;
  };
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });

  // 戻った時。
  useEffect(() => () => void persistRef.current(session.current), []);

  // アプリが裏に回ったら書き込んで表示中に戻す（戻ってきて続けるなら、
  // もう一度押して編集に入る＝ロックも取り直す）。
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "background") return;
      const s = session.current;
      if (!(s.noteId === null ? s.body.trim() !== "" : s.token !== null)) return;
      void persistRef.current(s).then((createdId) => {
        if (createdId) setNoteId(createdId);
      });
      setOriginal({ body: s.body, visibility: s.visibility });
      setToken(null);
      setEditing(false);
    });
    return () => sub.remove();
  }, []);

  // 編集中は期限を延ばし続ける。延ばせなかった＝他の人が取った。
  useEffect(() => {
    if (!noteId || !token) return;
    const id = setInterval(() => {
      void renewNoteLock(supabase, noteId, token).then((r) => {
        if (r.ok && !r.data) setLost(true);
      });
    }, NOTE_LOCK_RENEW_MS);
    return () => clearInterval(id);
  }, [noteId, token]);

  const startEditing = async () => {
    if (!noteId || busy) return;
    setBusy(true);
    const r = await acquireNoteLock(supabase, noteId);
    setBusy(false);
    if (!r.ok) {
      toast(t("failed", { error: r.error }));
      return;
    }
    if (!r.data.ok) {
      setLockedBy(nameOf(r.data.holderMemberId));
      return;
    }
    // 一覧で見ていた本文は古いかもしれないので、取れた時点の本文から始める。
    setBody(r.data.body);
    setVisibility(r.data.visibility);
    setOriginal({ body: r.data.body, visibility: r.data.visibility });
    setToken(r.data.token);
    setLost(false);
    setLockedBy(null);
    setEditing(true);
  };

  // 自分だけにできるのは作った人だけ（DB も同じ規則で止める）。
  const canChangeVisibility =
    note === null || note.createdByMemberId === myMemberId;

  return (
    <View style={styles.container}>
      {editing ? (
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t("placeholder")}
          accessibilityLabel={t("placeholder")}
          placeholderTextColor={theme.subtleForeground}
          multiline
          autoFocus
          scrollEnabled={false}
          style={styles.input}
        />
      ) : (
        <Pressable onPress={() => void startEditing()} style={styles.view}>
          <Text style={styles.body}>
            {noteSegments(body).map((s, i) =>
              s.kind === "link" ? (
                <Text
                  key={i}
                  style={styles.link}
                  onPress={() => void Linking.openURL(s.url)}
                  accessibilityRole="link"
                >
                  {s.text}
                </Text>
              ) : (
                <Text key={i}>{s.text}</Text>
              ),
            )}
          </Text>
        </Pressable>
      )}

      {lockedBy !== null && (
        <Text style={styles.notice}>{t("lockedNow", { name: lockedBy })}</Text>
      )}
      {lost && <Text style={styles.warning}>{t("lockLost")}</Text>}

      {editing && canChangeVisibility && (
        <VisibilitySegment value={visibility} onChange={setVisibility} />
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    container: { padding: 16, gap: 12 },
    input: {
      minHeight: 240,
      fontSize: 16,
      lineHeight: 22,
      color: t.foreground,
      textAlignVertical: "top",
    },
    // 表示中も入力欄と同じ位置・大きさで描く（押して編集に入っても文字が動かない）。
    view: { minHeight: 240 },
    body: { fontSize: 16, lineHeight: 22, color: t.foreground },
    // web のリンク（text-blue-600 / dark:text-blue-400）と同じ色。
    link: { color: t.linkText },
    notice: { fontSize: 12, color: t.mutedForeground },
    warning: { fontSize: 12, color: t.warnAccent },
  });
