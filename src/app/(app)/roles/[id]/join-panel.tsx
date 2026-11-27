"use client";

import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import {
  createJoinLinkAction,
  decideJoinRequestAction,
  releaseParticipantAction,
  revokeJoinLinkAction,
  type JoinLinkState,
  type JoinManageState,
} from "./join-actions";

const subscribe = () => () => {};
const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

export function JoinLinkPanel({ outingId, activeUntil }: { outingId: string; activeUntil: string | null }) {
  const [created, create, creating] = useActionState<JoinLinkState, FormData>(createJoinLinkAction, {});
  const [revoked, revoke, revoking] = useActionState<JoinManageState, FormData>(revokeJoinLinkAction, {});
  const shareAvailable = useSyncExternalStore(subscribe, canShare, () => false);
  const error = created.error ?? revoked.error;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {activeUntil
          ? `Há um link ativo até ${activeUntil}. Por segurança ele só aparece na hora de gerar; para ver de novo, gere outro.`
          : "Não há link ativo. Gere um link e compartilhe no grupo do WhatsApp ou mostre o QR code."}
      </p>
      {created.url && created.qr && (
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={created.qr} alt="QR code para entrar no rolê" width={260} height={260} className="rounded-2xl bg-white p-2" />
          <input readOnly value={created.url} onFocus={(event) => event.currentTarget.select()} className={inputClass} />
          {shareAvailable && (
            <Button type="button" variant="secondary" onClick={() => navigator.share({ title: "Entre no rolê", url: created.url })}>
              Compartilhar
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <form action={create} className="flex-1">
          <input type="hidden" name="outingId" value={outingId} />
          <Button type="submit" className="w-full" disabled={creating}>
            {activeUntil ? "Gerar novo link" : "Gerar link"}
          </Button>
        </form>
        {activeUntil && (
          <form action={revoke}>
            <input type="hidden" name="outingId" value={outingId} />
            <Button type="submit" variant="secondary" disabled={revoking}>
              Revogar
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function JoinRequestItem({ outingId, request }: { outingId: string; request: { id: string; name: string } }) {
  const [state, action, pending] = useActionState<JoinManageState, FormData>(decideJoinRequestAction, {});

  return (
    <li className="card-surface flex flex-col gap-3 p-4">
      <p className="text-sm">
        <span className="font-semibold">{request.name}</span> pediu para entrar.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <form action={action} className="flex gap-2">
        <input type="hidden" name="outingId" value={outingId} />
        <input type="hidden" name="requestId" value={request.id} />
        <Button type="submit" name="decision" value="approve" className="flex-1" disabled={pending}>
          Aprovar
        </Button>
        <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>
          Recusar
        </Button>
      </form>
    </li>
  );
}

export function ReleaseButton({ outingId, participantId }: { outingId: string; participantId: string }) {
  const [state, action, pending] = useActionState<JoinManageState, FormData>(releaseParticipantAction, {});

  return (
    <form action={action} className="ml-auto flex flex-col items-end gap-1">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="participantId" value={participantId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        Liberar nome
      </Button>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
