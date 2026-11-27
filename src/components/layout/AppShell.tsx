import { Bell, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Avatar } from "@/components/common/Avatar";
import { Backdrop } from "@/components/layout/Backdrop";
import { Logo } from "@/components/layout/Logo";
import { NavLink } from "@/components/layout/NavLink";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/login/actions";
import { getIdentity } from "@/server/auth";
import { loadProfile } from "@/server/profiles";
import { countUnread } from "@/server/push";

async function unreadCount() {
  const identity = await getIdentity();
  const profile = identity?.kind === "account" ? await loadProfile(identity.userId) : null;
  return profile ? countUnread(profile.personId) : null;
}

async function NoticesNav() {
  const unread = await unreadCount();
  return unread === null ? null : <NavLink href="/avisos" label="Avisos" icon="bell" variant="side" badge={unread} />;
}

async function NoticesBell() {
  const unread = await unreadCount();
  if (unread === null) {
    return null;
  }
  return (
    <Button asChild variant="ghost" size="icon" aria-label={unread > 0 ? `Avisos, ${unread} não lidos` : "Avisos"} title="Avisos" className="relative">
      <Link href="/avisos">
        <Bell />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-primary-glow" />}
      </Link>
    </Button>
  );
}

function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="icon" aria-label="Sair" title="Sair">
        <LogOut />
      </Button>
    </form>
  );
}

async function UserCard() {
  const identity = await getIdentity();
  const profile = identity ? await loadProfile(identity.userId) : null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-3">
      <Avatar name={profile?.displayName ?? "?"} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{profile?.displayName ?? "Convidado"}</span>
      <SignOutButton />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background bg-page-glow">
      <Backdrop />

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-6 border-r border-border bg-background/80 p-5 backdrop-blur md:flex">
        <Logo />
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
          <Suspense fallback={null}>
            <NavLink href="/" label="Início" icon="home" variant="side" />
            <NavLink href="/roles" label="Rolês" icon="outings" variant="side" />
            <NavLink href="/resumo" label="Resumo" icon="summary" variant="side" />
            <NavLink href="/historico" label="Histórico" icon="history" variant="side" />
            <NoticesNav />
            <NavLink href="/configuracoes" label="Configurações" icon="settings" variant="side" />
          </Suspense>
        </nav>
        <Suspense fallback={null}>
          <UserCard />
        </Suspense>
      </aside>

      <div className="relative md:pl-64">
        <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-6 md:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <Suspense fallback={null}>
              <NoticesBell />
            </Suspense>
            <SignOutButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-5 pb-28 pt-6 md:px-10 md:pb-12 md:pt-10">{children}</main>
      </div>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <Suspense fallback={null}>
          <NavLink href="/" label="Início" icon="home" variant="tab" />
          <NavLink href="/roles" label="Rolês" icon="outings" variant="tab" />
          <NavLink href="/resumo" label="Resumo" icon="summary" variant="tab" />
          <NavLink href="/historico" label="Histórico" icon="history" variant="tab" />
          <NavLink href="/configuracoes" label="Configurações" icon="settings" variant="tab" />
        </Suspense>
      </nav>
    </div>
  );
}
