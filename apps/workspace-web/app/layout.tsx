import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EthioTour Workspace',
  description: 'Private EthioTour National workspace',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
