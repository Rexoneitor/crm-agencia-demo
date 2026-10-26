"use client";

import { MobileTabBar, Sidebar, Topbar, type NavUser, type SearchFn } from "@/shared/ui/nav";
import { logoutAction, quickSearchAction } from "./actions";

export function AppShell({
  user,
  alertCount,
  children,
}: {
  user: NavUser;
  alertCount: number;
  children: React.ReactNode;
}) {
  const onLogout = () => {
    void logoutAction();
  };

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar user={user} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onLogout={onLogout} alertCount={alertCount} search={quickSearchAction as SearchFn} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pt-6 md:pb-10">{children}</main>
      </div>
      <MobileTabBar />
    </div>
  );
}
