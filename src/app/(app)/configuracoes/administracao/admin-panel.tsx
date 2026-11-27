"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import {
  approveRequestAction,
  createInviteAction,
  rejectRequestAction,
  revokeInviteAction,
  type AdminActionState,
} from "./actions";

export type PendingRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export function RequestCard({ request }: { request: PendingRequest }) {
  const [approved, approve, approving] = useActionState<AdminActionState, FormData>(approveRequestAction, {});
  const [rejected, reject, rejecting] = useActionState<AdminActionState, FormData>(rejectRequestAction, {});
  const error = approved.error ?? rejected.error;

  return (
    <li className="card-surface flex flex-col gap-3 p-4">
      <div>
        <p className="font-semibold">{request.name}</p>
        <p className="text-sm text-muted-foreground">{request.email}</p>
        <p className="text-sm text-muted-foreground">{request.phone}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <form action={approve}>
          <input type="hidden" name="id" value={request.id} />
          <Button type="submit" className="w-full" disabled={approving || rejecting}>
            Aprovar
          </Button>
        </form>
        <form action={reject} className="flex gap-2">
          <input type="hidden" name="id" value={request.id} />
          <input name="note" placeholder="Motivo (opcional)" maxLength={200} className={inputClass} />
          <Button type="submit" variant="secondary" disabled={approving || rejecting}>
            Recusar
          </Button>
        </form>
      </div>
    </li>
  );
}

export function InviteCreator() {
  const [state, action, pending] = useActionState<AdminActionState>(createInviteAction, {});
  const link = state.invitePath ? `${window.location.origin}${state.invitePath}` : null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <Button type="submit" disabled={pending}>
        Gerar convite
      </Button>
      {link && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Copie agora: o link não aparece de novo.</p>
          <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} className={inputClass} />
        </div>
      )}
    </form>
  );
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(revokeInviteAction, {});

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={inviteId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Revogar
      </Button>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
