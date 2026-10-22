import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EthioTour National',
  description:
    'EthioTour National — a platform for Ethiopian tourism, connecting destinations, service providers, and regulatory workflows.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
