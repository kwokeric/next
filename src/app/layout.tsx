import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "./fonts/Inter-4.1/InterVariable.ttf", style: "normal" },
    { path: "./fonts/Inter-4.1/InterVariable-Italic.ttf", style: "italic" },
  ],
  variable: "--font-inter",
});

const belgianoSerif = localFont({
  src: "./fonts/belgiano_serif/Belgiano Serif 2.ttf",
  variable: "--font-belgiano-serif",
});

export const metadata: Metadata = {
  title: "Next",
  description: "A simpler task manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${belgianoSerif.variable}`}>
      <body>
        {children}
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
