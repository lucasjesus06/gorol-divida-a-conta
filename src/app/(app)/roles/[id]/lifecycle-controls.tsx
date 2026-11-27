"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { closeOutingAction, leaveOutingAction, removeParticipantAction, type LifecycleState } from "./lifecycle-actions";

/** A button that asks "are you sure?" before running the action, and shows the rule's message when it refuses. */
function ConfirmAction({
  label,
  confirmLabel,
  question,
  variant = "secondary",
  size,
  disabled,
  run,
}: {
  label: string;
  confirmLabel: string;
  question: string;
  variant?: "secondary" | "ghost" | "default";
  size?: "sm";
  disabled?: boolean;
  run: () => Promise<LifecycleState>;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (result.error) {
        setError(result.error);
        setAsking(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {asking ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{question}</p>
          <div className="flex gap-2">
            <Button type="button" size={size} disabled={pending} onClick={confirm}>
              {confirmLabel}
            </Button>
            <Button type="button" size={size} variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size={size} variant={variant} disabled={disabled} onClick={() => setAsking(true)}>
          {label}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function CloseOutingButton({ outingId, blocked }: { outingId: string; blocked: boolean }) {
  return (
    <ConfirmAction
      label="Encerrar rolê"
      confirmLabel="Sim, encerrar"
      question="Depois de encerrado, ninguém lança mais nada neste rolê. Confirma?"
      disabled={blocked}
      run={() => closeOutingAction(outingId)}
    />
  );
}

export function RemoveParticipantButton({ outingId, personId, name }: { outingId: string; personId: string; name: string }) {
  return (
    <ConfirmAction
      label="Remover"
      confirmLabel="Sim, remover"
      question={`Tirar ${name} do rolê? Ele deixa de ver o rolê, mas o nome continua nas despesas antigas.`}
      variant="ghost"
      size="sm"
      run={() => removeParticipantAction(outingId, personId)}
    />
  );
}

export function LeaveOutingButton({ outingId }: { outingId: string }) {
  return (
    <ConfirmAction
      label="Sair do rolê"
      confirmLabel="Sim, sair"
      question="Você deixa de ver este rolê. Só dá para sair quando não há nada em aberto com ninguém. Confirma?"
      run={() => leaveOutingAction(outingId)}
    />
  );
}
