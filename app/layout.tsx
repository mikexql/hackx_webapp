import './globals.css'
import React from 'react'

export const metadata = {
  title: 'HackX Map Viewer',
  description: 'Cases viewer backed by S3'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: 20 }}>
          <h1>HackX Map Viewer</h1>
          {children}
        </div>
      </body>
    </html>
  )
}
