import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Federal Retirement Planner',
  description:
    'Year-by-year retirement financial picture for Canadian federal public servants. Estimates and educational projections only — not financial, tax, or legal advice.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
