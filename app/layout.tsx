import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#204e37"};

export const metadata: Metadata = {
  title: "Sunny Squeeze | Your lemonade stand",
  description: "Log lemonade sales, remember your customers, and see what makes your stand grow.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
