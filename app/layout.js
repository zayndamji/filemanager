import { Geist, Geist_Mono } from "next/font/google";

import "@/app/globals.css";
import { FolderProvider } from '@/context/FolderContext';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "File Manager",
  description: "File manager built to be secure.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FolderProvider>
          {children}
        </FolderProvider>
      </body>
    </html>
  );
}
