import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/features/home/HomePage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GoRolê — Racha a conta do bar sem estresse" },
      {
        name: "description",
        content:
          "Aponte pro QR Code da notinha, compartilhe o link e cada um paga só o que consumiu via Pix. Sem app pros convidados.",
      },
      { property: "og:title", content: "GoRolê — Racha a conta do bar sem estresse" },
      {
        property: "og:description",
        content: "Itens direto da Nota Fiscal (SEFAZ), divisão por item e Pix com valor exato.",
      },
    ],
  }),
  component: HomePage,
});
