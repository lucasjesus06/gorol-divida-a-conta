import { createFileRoute } from "@tanstack/react-router";
import { GuestPage } from "@/features/guest/GuestPage";

export const Route = createFileRoute("/m/$slug")({
  validateSearch: (s: Record<string, unknown>) => ({
    novo: s["novo"] === 1 || s["novo"] === "1" ? 1 : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar na mesa — GoRolê" },
      {
        name: "description",
        content: "Marque o que você consumiu e pague só a sua parte via Pix. Sem baixar nada.",
      },
      { property: "og:title", content: "Bora rachar a conta? — GoRolê" },
      {
        property: "og:description",
        content: "Entre na mesa digital com seu nome, marque seus itens e pague via Pix.",
      },
    ],
  }),
  component: GuestRoute,
});

function GuestRoute() {
  const { slug } = Route.useParams();
  const { novo } = Route.useSearch();
  return <GuestPage slug={slug} isNewGuest={Boolean(novo)} />;
}
