import { useEffect, useState } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';

export default function Login() {
  const supabase = useSupabaseClient();
  const session = useSession();
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);

  const getRedirectPath = () => {
    const nextParam = typeof router.query.next === 'string' ? router.query.next : '';
    if (nextParam.startsWith('/')) {
      return nextParam;
    }
    return '/admin/upload-lesson';
  };

  useEffect(() => {
    if (!router.isReady || !session) {
      return;
    }

    let cancelled = false;

    const verifyAdmin = async () => {
      const response = await fetch('/api/admin/session-check', {
        method: 'GET',
        credentials: 'include',
      });

      if (cancelled) {
        return;
      }

      if (response.ok) {
        void router.replace(getRedirectPath());
        return;
      }

      setAuthError('Этот аккаунт не входит в список администраторов.');
      await supabase.auth.signOut();
    };

    void verifyAdmin();

    return () => {
      cancelled = true;
    };
  }, [router, session, supabase]);

  const handleGoogleLogin = async () => {
    const redirectPath = getRedirectPath();
    const callbackPath = `/login?next=${encodeURIComponent(redirectPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          typeof window === 'undefined'
            ? undefined
            : `${window.location.origin}${callbackPath}`,
      },
    });
    if (error) {
      alert('Ошибка входа: ' + error.message);
    }
  };

  return (
    <div style={{ padding: 40, maxWidth: 400, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 24 }}>Вход в систему</h1>
      <p style={{ marginBottom: 24, color: '#666' }}>Доступ разрешен только через Google.</p>
      {authError ? <p style={{ marginBottom: 24, color: '#c0392b' }}>{authError}</p> : null}

      <button
        onClick={handleGoogleLogin}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          backgroundColor: 'white',
          color: '#444',
          border: '1px solid #ccc',
          borderRadius: 4,
          width: '100%',
          marginBottom: 24,
          cursor: 'pointer',
        }}
      >
        <img src="https://upload.wikimedia.org/wikipedia/commons/4/4a/Logo_2013_Google.png" alt="Google" style={{ width: 20 }} />
        Войти через Google
      </button>
    </div>
  );
}
