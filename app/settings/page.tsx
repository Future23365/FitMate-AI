"use client";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { useLocalAuth } from "@/components/auth/local-auth-provider";

const profileItems = [
  { label: "训练目标", value: "待完善", icon: "flag" },
  { label: "训练经验", value: "待完善", icon: "fitness_center" },
  { label: "可用器械", value: "待完善", icon: "exercise" },
];

export default function SettingsPage() {
  const { status, user, resetLocalUser } = useLocalAuth();
  const userName = user?.displayName || "匿名用户";

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
          <div className="flex items-center justify-between gap-lg">
            <div className="min-w-0">
              <div className="flex items-center gap-sm">
                <SymbolIcon className="text-[22px] text-primary">person_cancel</SymbolIcon>
                <h2 className="text-xl font-extrabold text-ink">本地用户</h2>
              </div>
              <p className="mt-sm text-sm font-semibold text-muted">
                重置只清理当前浏览器保存的匿名凭证，不删除服务器上旧匿名用户的数据。
              </p>
            </div>
            <button
              className="shrink-0 rounded-xl border border-error/30 bg-error-container px-4 py-2 text-sm font-extrabold text-error transition-colors hover:bg-error-container/80"
              disabled={status === "resetting"}
              onClick={resetLocalUser}
              type="button"
            >
              {status === "resetting" ? "正在重置..." : "重置本地用户"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
