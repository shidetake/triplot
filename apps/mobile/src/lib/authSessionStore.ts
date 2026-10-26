import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

// ログイン状態（Supabase のセッション）の置き場所。
//
// **共有画面（Google マップの「共有」→ triplot の拡張機能）とキーチェーンで
// 分け合う。** 共有画面は triplot を開かずに旅行の一覧を読み、場所を足すので、
// ログイン中の人のトークンが要る。アプリの中（AsyncStorage）は拡張機能から
// 読めないので、両方が入れるキーチェーンのグループに置く。拡張機能はトークンの
// 期限が切れていれば取り直してここへ書き戻す。supabase-js はセッションを使う
// たびにここから読み直すので、アプリは拡張機能が取り直したトークンをそのまま使う
// （古いトークンで取り直して弾かれることが無い）。
//
// 読み書きの形（サービス名・グループ）は拡張機能の Swift 側
// （targets/share/SessionStore.swift）と一致させること。

// グループ名は「チーム ID.本体の bundle id」（app.config.ts の keychain-access-groups）。
const ios = Constants.expoConfig?.ios;
const keychainGroup = `${ios?.appleTeamId}.${ios?.bundleIdentifier}`;

export const SESSION_KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "triplot.session",
  accessGroup: keychainGroup,
  // 拡張機能は端末がロックされていても（解除後なら）読めるようにする。
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export const authSessionStore = {
  async getItem(key: string): Promise<string | null> {
    const value = await SecureStore.getItemAsync(key, SESSION_KEYCHAIN_OPTIONS);
    if (value !== null) return value;
    // 以前の版は AsyncStorage に置いていた。そのまま読めないとログアウトされる
    // ので、初めて読んだ時にキーチェーンへ写して、元を消す。
    const legacy = await AsyncStorage.getItem(key);
    if (legacy === null) return null;
    await SecureStore.setItemAsync(key, legacy, SESSION_KEYCHAIN_OPTIONS);
    await AsyncStorage.removeItem(key);
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, SESSION_KEYCHAIN_OPTIONS);
  },
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key, SESSION_KEYCHAIN_OPTIONS);
    await AsyncStorage.removeItem(key);
  },
};
