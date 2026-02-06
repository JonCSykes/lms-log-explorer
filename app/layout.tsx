import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from "next/font/google";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
