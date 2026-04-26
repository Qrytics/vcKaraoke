import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'vcKaraoke — Virtual Karaoke Night',
  description: 'Host the ultimate virtual karaoke night with friends!',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
