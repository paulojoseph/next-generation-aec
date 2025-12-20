import type { Metadata, Viewport } from "next";
import { Inter, Roboto, JetBrains_Mono, Outfit, Space_Grotesk, Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastProvider } from "@/contexts/ToastContext";

// Google Fonts for theme system
const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-inter',
});

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-roboto',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-jetbrains',
});

const outfit = Outfit({
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-outfit',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-poppins',
});

// Configuração de Viewport separada (Padrão Next.js 14+)
export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "NextGen AEC | Spatial Intelligence Engine",
  description: "High-performance LiDAR & BIM visualization platform built with Next.js, Three.js and Cloud-Native Architecture.",
  keywords: ["LiDAR", "AEC", "Three.js", "WebGPU", "Digital Twin", "BIM"],
  authors: [{ name: "Paulo Marques" }],
  openGraph: {
    title: "NextGen AEC | Spatial Intelligence Engine",
    description: "Real-time 60FPS point cloud analysis directly in the browser. A Founding Engineer tech showcase.",
    url: "https://nextgen-aec.vercel.app",
    siteName: "NextGen AEC",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NextGen AEC Platform",
    description: "Processing 1M+ points in the browser with WebGL.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${roboto.variable} ${jetbrainsMono.variable} ${outfit.variable} ${spaceGrotesk.variable} ${poppins.variable} antialiased bg-zinc-950 text-white overflow-hidden`}
        suppressHydrationWarning
        style={{ fontFamily: 'var(--theme-font)' }}
      >
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}