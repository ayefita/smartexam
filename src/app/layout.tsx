import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { getDictionary } from "@/lib/locale";

const body = localFont({
  src: [
    { path: "../../assets/fonts/NotoSansEthiopic-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../assets/fonts/NotoSansEthiopic-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: { default: "SmartExam", template: "%s · SmartExam" },
  description: "Smart Online Examination System for exit exams, entrance exams, and job recruitment.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getDictionary();
  return (
    <html lang={locale}>
      <body className={`${body.variable} ${display.variable} antialiased`}>{children}</body>
    </html>
  );
}
