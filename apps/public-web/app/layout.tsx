import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EthioTour National',
  description: 'EthioTour National public web foundation',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
