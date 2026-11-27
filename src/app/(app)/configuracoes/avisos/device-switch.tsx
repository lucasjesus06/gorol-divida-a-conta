"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { disableDeviceAction, enableDeviceAction } from "./actions";

type Status = "checking" | "unsupported" | "denied" | "off" | "on";

function keyToBytes(base64: string) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function DeviceSwitch({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    async function check() {
      if (!supported()) {
        return "unsupported";
      }
      if (Notification.permission === "denied") {
        return "denied";
      }
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      return subscription ? "on" : "off";
    }
    check().then(
      (next) => active && setStatus(next),
      () => active && setStatus("off"),
    );
    return () => {
      active = false;
    };
  }, []);

  function enable() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        await navigator.serviceWorker.register("/sw.js");
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
        const json = subscription.toJSON();
        const result = await enableDeviceAction({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setStatus("on");
      } catch {
        setError("Não foi possível ligar os avisos neste aparelho. Tente de novo.");
      }
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await disableDeviceAction(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setStatus("off");
      } catch {
        setError("Não foi possível desligar os avisos neste aparelho. Tente de novo.");
      }
    });
  }

  const messages: Record<Status, string> = {
    checking: "Verificando este aparelho…",
    unsupported: "Este navegador não recebe avisos. No iPhone, instale o app na tela inicial primeiro.",
    denied: "Os avisos estão bloqueados no navegador. Libere nas configurações do site para ligar.",
    off: "Desligado neste aparelho.",
    on: "Ligado neste aparelho.",
  };

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm text-muted-foreground">
        {messages[status]}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {status === "off" && (
        <Button type="button" onClick={enable} disabled={pending}>
          Ligar avisos neste aparelho
        </Button>
      )}
      {status === "on" && (
        <Button type="button" variant="secondary" onClick={disable} disabled={pending}>
          Desligar neste aparelho
        </Button>
      )}
    </div>
  );
}
