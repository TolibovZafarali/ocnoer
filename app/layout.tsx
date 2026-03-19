import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Literata } from "next/font/google";

import "./globals.css";

const dialogueFont = Literata({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dialogue"
});

export const metadata: Metadata = {
  title: "Ocnoer",
  description: "Private interactive story platform"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
        />
      </head>
      <body className={dialogueFont.variable}>{children}</body>
    </html>
  );
}
