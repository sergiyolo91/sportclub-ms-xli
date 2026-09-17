import './globals.css'

export const metadata = {
  title: 'Sportclub MS XLI',
  description: 'Trainieren. Eintragen. Fortschritt sehen. Gemeinsam stärker.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MS XLI', statusBarStyle: 'default' as const },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
