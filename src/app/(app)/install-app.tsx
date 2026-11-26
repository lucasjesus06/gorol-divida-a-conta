"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "gorole:instalacao-dispensada";
const CHANGE_EVENT = "gorole:instalacao";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = "installed" | "dismissed" | "ios" | "browser";

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function installState(): InstallState {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) {
    return "installed";
  }
  try {
    if (localStorage.getItem(DISMISSED_KEY) === "1") {
      return "dismissed";
    }
  } catch {
    return "dismissed";
  }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "browser";
}

function dismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function InstallApp() {
  const state = useSyncExternalStore(subscribe, installState, () => "installed" as const);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    function capture(event: Event) {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    }
    function installed() {
      setPromptEvent(null);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    }
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (state === "installed" || state === "dismissed" || (state === "browser" && !promptEvent)) {
    return null;
  }

  async function install() {
    if (!promptEvent) {
      return;
    }
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground sm:flex-row sm:items-center sm:p-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        <Smartphone className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="font-semibold">Use o GoRolê como aplicativo</h2>
        <p className="text-sm text-muted-foreground">
          {state === "ios"
            ? "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. O GoRolê passa a abrir em tela cheia, direto do ícone."
            : "Instale na tela inicial para abrir o GoRolê em tela cheia, direto do ícone, sem precisar do navegador."}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {state !== "ios" && <Button onClick={install}>Instalar</Button>}
        <Button variant="ghost" onClick={dismiss}>
          {state === "ios" ? "Entendi" : "Agora não"}
        </Button>
      </div>
    </section>
  );
}
