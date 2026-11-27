import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/common/Avatar";
import { Pill } from "@/components/common/Pill";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { getOuting } from "@/server/outings";
import { getActiveJoinLink, listJoinRequests } from "@/server/join";
import { JoinLinkPanel, JoinRequestItem, ReleaseButton } from "./join-panel";
import { ParticipantForm } from "./participant-form";

export const metadata: Metadata = {
  title: "Rolê · GoRolê",
};

const kindLabels = { event: "Pontual", recurring: "Recorrente" } as const;
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

async function OutingContent({ params }: Pick<PageProps<"/roles/[id]">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let outing;
  try {
    outing = await getOuting(profile.personId, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "outing_not_found") {
      notFound();
    }
    throw error;
  }
  const isAdmin = outing.role === "admin";
  const [requests, link] = isAdmin
    ? await Promise.all([listJoinRequests(profile.personId, id), getActiveJoinLink(profile.personId, id)])
    : [[], null];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">{outing.name}</h1>
        <div className="flex gap-2">
          <Pill>{kindLabels[outing.kind]}</Pill>
          {outing.status === "closed" && <Pill>Encerrado</Pill>}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Participantes</h2>
        <ul className="flex flex-col gap-2">
          {outing.participants.map((participant) => (
            <li key={participant.id} className="card-surface flex items-center gap-3 p-3">
              <Avatar name={participant.displayName} size="sm" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  {participant.displayName}
                  {participant.role === "admin" && <span className="ml-2 text-xs font-normal text-muted-foreground">dono</span>}
                  {!participant.joined && <span className="ml-2 text-xs font-normal text-muted-foreground">ainda não entrou</span>}
                </span>
                {participant.phone && <span className="text-xs text-muted-foreground">{participant.phone}</span>}
              </div>
              {participant.releasable && <ReleaseButton outingId={outing.id} participantId={participant.id} />}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && requests.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Pedidos para entrar</h2>
          <ul className="flex flex-col gap-3">
            {requests.map((request) => (
              <JoinRequestItem key={request.id} outingId={outing.id} request={{ id: request.id, name: request.name }} />
            ))}
          </ul>
        </section>
      )}

      {isAdmin && outing.status === "active" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Link do rolê</h2>
          <div className="card-surface p-6">
            <JoinLinkPanel outingId={outing.id} activeUntil={link ? dateFormat.format(link.expiresAt) : null} />
          </div>
        </section>
      )}

      {isAdmin && outing.status === "active" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Adicionar participante</h2>
          <div className="card-surface p-6">
            <ParticipantForm outingId={outing.id} />
          </div>
        </section>
      )}
    </div>
  );
}

export default function OutingPage(props: PageProps<"/roles/[id]">) {
  return (
    <Shell
      back={
        <Button asChild variant="ghost" size="icon" aria-label="Voltar" title="Voltar">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
      }
      hideLogo
    >
      <div className="mt-4">
        <Suspense fallback={null}>
          <OutingContent params={props.params} />
        </Suspense>
      </div>
    </Shell>
  );
}
