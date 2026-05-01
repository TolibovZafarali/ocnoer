import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Bad_Script,
  Imperial_Script,
  Literata,
  Tangerine
} from "next/font/google";

import "./globals.css";

const dialogueFont = Literata({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dialogue"
});

const characterNameFont = Tangerine({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-character-name"
});

const dressPromptFont = Imperial_Script({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-dress-prompt"
});

const chapterCardFont = Bad_Script({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["400"],
  display: "swap",
  variable: "--font-chapter-card"
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
      <body
        suppressHydrationWarning
        className={`${dialogueFont.variable} ${characterNameFont.variable} ${dressPromptFont.variable} ${chapterCardFont.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
