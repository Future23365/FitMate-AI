"use client";

import { useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { useLocalAuth } from "@/components/auth/local-auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const profileItems = [
  { label: "训练目标", value: "待完善", icon: "flag" },
  { label: "训练经验", value: "待完善", icon: "fitness_center" },
  { label: "可用器械", value: "待完善", icon: "exercise" },
];

export default function SettingsPage() {
  const { status, user, resetLocalUser } = useLocalAuth();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const userName = user?.displayName || "匿名用户";
  const isResetting = status === "resetting";

  async function confirmResetLocalUser() {
    setResetError(null);

    try {
      await resetLocalUser();
      setResetDialogOpen(false);
    } catch {
      setResetError("重置失败，请稍后重试。");
    }
  }

  return (
    <main className="app-mesh-bg fixed bottom-0 left-[var(--app-sidebar-offset)] right-0 top-0 overflow-y-auto px-lg py-xl text-ink xl:px-2xl">
      <div className="mx-auto flex max-w-5xl flex-col gap-xl">
        <header className="rounded-2xl border border-line/70 bg-white/78 p-xl shadow-card backdrop-blur-2xl">
          <div className="flex items-center gap-md">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-extrabold text-primary ring-1 ring-primary/10">
              <SymbolIcon className="text-[34px]" filled>
                person
              </SymbolIcon>
            </div>
            <div>
              <p className="text-sm font-bold text-primary">用户设置</p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
                {userName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-muted">
                管理个人资料、训练偏好和后续个性化推荐所需的信息。
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-md md:grid-cols-2">
          <div className="rounded-xl border border-line/70 bg-white/86 p-lg shadow-card backdrop-blur-xl">
            <div className="mb-md flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <SymbolIcon className="text-[20px]">badge</SymbolIcon>
            </div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted">
              名称
            </p>
            <p className="mt-2 text-lg font-extrabold text-ink">{userName}</p>
          </div>
          {profileItems.map((item) => (
            <div
              className="rounded-xl border border-line/70 bg-white/86 p-lg shadow-card backdrop-blur-xl"
              key={item.label}
            >
              <div className="mb-md flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <SymbolIcon className="text-[20px]">{item.icon}</SymbolIcon>
              </div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted">
                {item.label}
              </p>
              <p className="mt-2 text-lg font-extrabold text-ink">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-line/70 bg-white/86 p-xl shadow-card backdrop-blur-xl">
          <div className="flex items-center gap-sm">
            <SymbolIcon className="text-[22px] text-primary">tune</SymbolIcon>
            <h2 className="text-xl font-extrabold text-ink">偏好设置</h2>
          </div>
          <p className="mt-sm text-sm font-semibold text-muted">
            用户系统和长期画像接入后，这里会承载资料编辑、训练偏好、通知和隐私选项。
          </p>
        </section>

        <section className="rounded-2xl border border-line/70 bg-white/86 p-xl shadow-card backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-lg">
            <div className="min-w-0">
              <div className="flex items-center gap-sm">
                <SymbolIcon className="text-[22px] text-primary">restart_alt</SymbolIcon>
                <h2 className="text-xl font-extrabold text-ink">本地用户</h2>
              </div>
              <p className="mt-sm text-sm font-semibold text-muted">
                重置会退出当前浏览器保存的匿名用户，并无法恢复，但可建立新的匿名用户继续使用。
              </p>
            </div>
            <Button
              className="shrink-0 border-error/30 bg-error-container text-error hover:bg-error-container/80"
              disabled={isResetting}
              onClick={() => {
                setResetError(null);
                setResetDialogOpen(true);
              }}
              type="button"
              variant="outline"
            >
              {isResetting ? "正在重置..." : "重置本地用户"}
            </Button>
          </div>
        </section>
      </div>

      <Dialog
        open={resetDialogOpen}
        onOpenChange={(open) => {
          if (isResetting) {
            return;
          }

          setResetError(null);
          setResetDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-error-container text-error ring-1 ring-error/10">
            <SymbolIcon className="text-[28px]">
              warning
            </SymbolIcon>
          </div>
          <DialogHeader>
            <p className="text-sm font-bold text-error">危险操作</p>
            <DialogTitle className="text-2xl font-extrabold text-ink">
              重置本地用户？
            </DialogTitle>
            <DialogDescription className="text-sm font-semibold leading-6 text-muted">
              当前操作无法撤销，重置后无法恢复当前用户数据，是否继续？
            </DialogDescription>
          </DialogHeader>
          {resetError ? (
            <p className="rounded-lg border border-error/20 bg-error-container px-3 py-2 text-sm font-semibold text-error">
              {resetError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={isResetting} type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              className="bg-error text-white hover:bg-error/90"
              disabled={isResetting}
              onClick={confirmResetLocalUser}
              type="button"
            >
              {isResetting ? "正在重置..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
