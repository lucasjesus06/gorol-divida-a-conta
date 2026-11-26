import type { Metadata, Viewport } from "next";
import { plusJakarta } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoRolê",
  description:
    "Divida as despesas do rolê, veja quem deve a quem e acerte com o menor número de Pix.",
  applicationName: "GoRolê",
  appleWebApp: {
    capable: true,
    title: "GoRolê",
    statusBarStyle: "black",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0d12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`dark ${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
