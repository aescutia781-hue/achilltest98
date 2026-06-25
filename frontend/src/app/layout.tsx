import type { Metadata } from 'next'

export const metadata: Metadata = {
  title:       'Achilltest — QA Automation con IA para América',
  description: 'De QA manual a QA automatizador. Genera y ejecuta tests de Playwright en minutos.',
  icons:       { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#08080f' }}>
        {children}
      </body>
    </html>
  )
}
