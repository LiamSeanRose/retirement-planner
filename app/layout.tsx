import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Retirement Almanac — Federal Public Service Planner',
  description:
    'A year-by-year retirement financial picture for Canadian federal public servants: pension, CPP/OAS, savings, tax, and strategy. Runs entirely in your browser — your data never leaves your device. Estimates and educational projections only — not financial, tax, or legal advice.',
  applicationName: 'The Retirement Almanac',
  openGraph: {
    title: 'The Retirement Almanac',
    description:
      'Model your federal pension, CPP/OAS, savings, and tax year by year — and see how an early retirement changes the whole trajectory. Private by design: all computation runs in your browser.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
