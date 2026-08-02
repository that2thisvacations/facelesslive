import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FacelessLive | Go Live. Stay Faceless. Sell More.",
  description: "AI-powered live commerce for faceless livestream selling.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
