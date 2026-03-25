import type { AppProps } from 'next/app'
import '../styles/globals.css'
import '../styles/upload-lesson.css';
import '../styles/upload-video.css';
import '../styles/AdminTranslations.css';
import '../styles/admin-books.css';
import '../styles/admin-story-submissions.css';
import { SessionContextProvider } from '@supabase/auth-helpers-react'
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useState } from 'react'

export default function MyApp({ Component, pageProps }: AppProps) {
  const [supabase] = useState(() => createPagesBrowserClient())

  return (
    <SessionContextProvider supabaseClient={supabase} initialSession={pageProps.initialSession}>
      <Component {...pageProps} />
    </SessionContextProvider>
  )
}
