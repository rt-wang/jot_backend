import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'jot API',
  description: 'Audio → Transcript → Organized Editable Note App',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

