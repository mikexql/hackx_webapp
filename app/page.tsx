import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <p>Welcome — view cases stored in S3.</p>
      <Link href="/cases">Open Cases</Link>
    </main>
  )
}
