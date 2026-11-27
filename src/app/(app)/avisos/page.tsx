import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getRenderProfile } from "@/server/auth";
import { listNotifications } from "@/server/push";
import { markAllReadAction, openNotificationAction } from "./actions";

export const metadata: Metadata = {
  title: "Avisos · GoRolê",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

async function NotificationList() {
  const profile = await getRenderProfile();
  const notices = await listNotifications(profile.personId);

  if (notices.length === 0) {
    return (
      <div className="card-surface flex flex-col items-center gap-2 p-8 text-center">
        <Bell className="size-8 text-muted-foreground" />
        <p className="font-semibold">Nenhum aviso por enquanto</p>
        <p className="text-sm text-muted-foreground">Pedidos para entrar no rolê e pagamentos a confirmar aparecem aqui.</p>
      </div>
    );
  }

  const hasUnread = notices.some((notice) => notice.readAt === null);
  return (
    <div className="flex flex-col gap-3">
      {hasUnread && (
        <form action={markAllReadAction} className="self-end">
          <Button type="submit" variant="secondary" size="sm">
            Marcar tudo como lido
          </Button>
        </form>
      )}
      <ul className="flex flex-col gap-2">
        {notices.map((notice) => (
          <li key={notice.id}>
            <form action={openNotificationAction}>
              <input type="hidden" name="id" value={notice.id} />
              <button
                type="submit"
                className={cn(
                  "card-surface flex w-full flex-col gap-1 p-4 text-left transition-colors hover:bg-accent/40",
                  notice.readAt === null && "border-primary-glow",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{notice.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{dateFormat.format(notice.createdAt)}</span>
                </span>
                <span className="text-sm text-muted-foreground">{notice.body}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NoticesPage() {
  return (
    <>
      <PageHeader title="Avisos" description="O que precisa da sua atenção nos rolês." />
      <Suspense fallback={null}>
        <NotificationList />
      </Suspense>
    </>
  );
}
