"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { confirmDialog } from "@/components/confirm-dialog";
import { TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount } from "@triplot/shared/data/account";

// アカウント削除。App Store Review Guideline 5.1.1(v) が、アカウント作成を
// 提供するアプリにアプリ内での削除経路を求めている。
//
// 設定の一番下に、区切り線で隔てて置く。アカウントメニューの直下に置くと
// ログアウトと隣り合って誤タップの的になる（取り消せない操作なので、
// 1階層奥に置いて confirmDialog を挟む）。
export function DeleteAccountButton() {
  const t = useTranslations("account");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    const confirmed = await confirmDialog({
      title: t("deleteConfirmTitle"),
      body: t("deleteConfirmBody"),
      confirmLabel: t("deleteConfirmLabel"),
    });
    if (!confirmed) return;

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }

    const result = await deleteAccount(supabase, user.id);
    if (!result.ok) {
      setBusy(false);
      toast(t("deleteFailed", { message: result.error }));
      return;
    }

    // アカウントはもう無いので、残っているセッションを捨ててLPへ。
    await supabase.auth.signOut();
    router.replace("/");
  };

  return (
    <Button
      variant="destructive"
      onClick={handleDelete}
      disabled={busy}
      className="w-full"
    >
      <TrashIcon size={18} />
      {t("deleteAccount")}
    </Button>
  );
}
