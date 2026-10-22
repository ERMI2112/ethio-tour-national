import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EthioTour National',
  description: 'EthioTour National: private hotel onboarding in a controlled synthetic pilot.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
