import type { Metadata } from "next";
import "./globals.css";
import "./integrations.css";
import { AppNav } from "@/components/app-nav";

export const metadata: Metadata = {
  title: "FacelessLive | Go Live. Stay Faceless. Sell More.",
  description: "AI-powered live commerce for faceless livestream selling.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AppNav/>{children}</body>
    </html>
  );
}
