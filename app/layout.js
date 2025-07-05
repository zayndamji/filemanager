import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";
import { FileProvider } from '@/context/FileContext';
import { PasswordProvider } from '@/context/PasswordContext';
import PasswordInput from "@/components/PasswordInput";

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
        <FileProvider>
          <PasswordProvider>
            <PasswordInput />
            {children}
          </PasswordProvider>
        </FileProvider>
      </body>
    </html>
  );
}