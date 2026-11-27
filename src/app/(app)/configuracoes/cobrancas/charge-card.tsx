"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/domain/money";
import { pauseChargesAction, recordReminderAction } from "./actions";

export type ChargeCardItem = {
  debtorId: string;
  debtorName: string;
  creditorId: string;
  creditorName: string;
  amountCents: number;
  outingNames: string[];
  sentCount: number;
  pausesUsed: number;
  status:
    | { kind: "send"; message: string; whatsappUrl: string | null; canPause: boolean }
    | { kind: "wait"; label: string }
    | { kind: "hold"; label: string };
};

export function ChargeCard({ item }: { item: ChargeCardItem }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pair = { debtorId: item.debtorId, creditorId: item.creditorId };

  function run(work: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.error) setError(result.error);
    });
  }

  return (
    <li className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {item.debtorName} deve a {item.creditorName}
          </p>
          <p className="text-sm text-muted-foreground">{item.outingNames.join(", ")}</p>
          <p className="text-xs text-muted-foreground">
            {item.sentCount === 0 ? "Nenhuma cobrança enviada" : `${item.sentCount} cobrança(s) enviada(s)`}
            {item.pausesUsed > 0 ? ` · ${item.pausesUsed} pausa(s)` : ""}
          </p>
        </div>
        <span className="shrink-0 text-lg font-extrabold">{formatCents(item.amountCents)}</span>
      </div>

      {item.status.kind === "send" ? (
        <>
          <p className="rounded-2xl bg-muted/40 p-3 text-sm">{item.status.message}</p>
          <div className="flex flex-wrap gap-2">
            {item.status.whatsappUrl && (
              <Button asChild disabled={pending}>
                <a
                  href={item.status.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => run(() => recordReminderAction({ ...pair, channel: "whatsapp" }))}
                >
                  Abrir WhatsApp
                </a>
              </Button>
            )}
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => recordReminderAction({ ...pair, channel: "app" }))}>
              Avisar no app
            </Button>
            {item.status.canPause && (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => pauseChargesAction(pair))}>
                Registrar pausa
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{item.status.label}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
