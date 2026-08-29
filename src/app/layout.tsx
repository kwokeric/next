import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${belgianoSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
