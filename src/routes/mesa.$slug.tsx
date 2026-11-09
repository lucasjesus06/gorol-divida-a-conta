import { createFileRoute } from "@tanstack/react-router";
import { HostPage } from "@/features/host/HostPage";

export const Route = createFileRoute("/mesa/$slug")({
  head: () => ({
    meta: [
      { title: "Rolê ativo — GoRolê" },
      {
        name: "description",
        content:
          "Itens da nota fiscal, taxa de serviço por item e status de pagamento de cada amigo da mesa.",
      },
      { property: "og:title", content: "Rolê ativo — GoRolê" },
      {
        property: "og:description",
        content: "Painel do dono do rolê: itens da SEFAZ, link da mesa e quem já pagou.",
      },
    ],
  }),
  component: MesaRoute,
});

function MesaRoute() {
  const { slug } = Route.useParams();
  return <HostPage slug={slug} />;
}
