import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";

const display = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-cormorant", weight: ["400", "500", "600", "700"] });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Iron Halo Tattoo Co. | Considered mark-making", template: "%s | Iron Halo Tattoo Co." },
  description: "Iron Halo Tattoo Co. is a private studio for deliberate, lasting work. Explore the studio and request a consultation.",
  openGraph: { title: "Iron Halo Tattoo Co.", description: "A private studio for deliberate, lasting work.", type: "website" },
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${sans.variable} font-sans antialiased`}>{children}</body></html>;
}
