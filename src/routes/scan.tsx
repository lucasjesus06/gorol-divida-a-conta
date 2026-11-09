import { createFileRoute } from "@tanstack/react-router";
import { ScanPage } from "@/features/scan/ScanPage";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Escanear notinha — GoRolê" },
      {
        name: "description",
        content: "Aponte para o QR Code da NFC-e ou SAT e deixe o GoRolê puxar os itens da SEFAZ.",
      },
      { property: "og:title", content: "Escanear notinha — GoRolê" },
      {
        property: "og:description",
        content: "Leitura do QR Code da nota fiscal e consulta automática à SEFAZ.",
      },
    ],
  }),
  component: ScanPage,
});
