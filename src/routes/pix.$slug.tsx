import { createFileRoute } from "@tanstack/react-router";
import { PixPage } from "@/features/payment/PixPage";

export const Route = createFileRoute("/pix/$slug")({
  head: () => ({
    meta: [
      { title: "Pagar minha parte via Pix — GoRolê" },
      {
        name: "description",
        content:
          "Pix Copia e Cola com o valor exato do que você consumiu, confirmado automaticamente.",
      },
      { property: "og:title", content: "Pagar minha parte via Pix — GoRolê" },
      {
        property: "og:description",
        content: "Código Pix dinâmico com o valor certinho da sua parte na mesa.",
      },
    ],
  }),
  component: PixRoute,
});

function PixRoute() {
  const { slug } = Route.useParams();
  return <PixPage slug={slug} />;
}
