import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkflowForge",
  description: "Dashboard de Automações",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
