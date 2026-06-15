import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';

export default function Login() {
  const supabase = useSupabaseClient();
  const session = useSession();
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [loginStarting, setLoginStarting] = useState(false);
  const callbackCleanupRef = useRef(false);
  const callbackCleanupTimerRef = useRef<number | null>(null);

  const redirectPath = useMemo(() => {
    const nextParam = typeof router.query.next === 'string' ? router.query.next : '';
    if (nextParam.startsWith('/')) {
      return nextParam;
    }
    return '/admin/upload-lesson';
  }, [router.query.next]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const code = typeof router.query.code === 'string' ? router.query.code : '';
    const cleanCallbackUrl = async () => {
      const nextQuery = typeof router.query.next === 'string' ? { next: router.query.next } : {};
      await router.replace({ pathname: '/login', query: nextQuery }, undefined, { shallow: true });
    };

    if (code && session) {
      if (callbackCleanupTimerRef.current !== null) {
        window.clearTimeout(callbackCleanupTimerRef.current);
        callbackCleanupTimerRef.current = null;
      }
      callbackCleanupRef.current = true;
      void cleanCallbackUrl();
      return;
    }

    if (!code || callbackCleanupRef.current) {
      return;
    }

    callbackCleanupRef.current = true;
    setAuthError(null);
    setAuthStatus('Завершаю вход через Google...');

    callbackCleanupTimerRef.current = window.setTimeout(() => {
      void cleanCallbackUrl();
      callbackCleanupTimerRef.current = null;
      setAuthStatus(null);
      setLoginStarting(false);
      setAuthError('Не удалось завершить вход. Если видите 429, подождите несколько минут и попробуйте снова.');
    }, 8000);
  }, [router, session]);

  useEffect(() => {
    return () => {
      if (callbackCleanupTimerRef.current !== null) {
        window.clearTimeout(callbackCleanupTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!router.isReady || !session) {
      return;
    }

    let cancelled = false;

    const verifyAdmin = async () => {
      setAuthStatus('Проверяю доступ администратора...');
      const response = await fetch('/api/admin/session-check', {
        method: 'GET',
        credentials: 'include',
      });

      if (cancelled) {
        return;
      }

      if (response.ok) {
        void router.replace(redirectPath);
        return;
      }

      setAuthStatus(null);
      setAuthError('Этот аккаунт не входит в список администраторов.');
      await supabase.auth.signOut();
    };

    void verifyAdmin();

    return () => {
      cancelled = true;
    };
  }, [redirectPath, router, session, supabase]);

  const handleGoogleLogin = async () => {
    if (loginStarting) {
      return;
    }

    setLoginStarting(true);
    setAuthError(null);
    setAuthStatus('Открываю вход через Google...');
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
      setLoginStarting(false);
      setAuthStatus(null);
      setAuthError('Ошибка входа: ' + error.message);
    }
  };

  return (
    <div style={{ padding: 40, maxWidth: 400, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 24 }}>Вход в систему</h1>
      <p style={{ marginBottom: 24, color: '#666' }}>Доступ разрешен только через Google.</p>
      {authStatus ? <p style={{ marginBottom: 24, color: '#334155' }}>{authStatus}</p> : null}
      {authError ? <p style={{ marginBottom: 24, color: '#c0392b' }}>{authError}</p> : null}

      <button
        onClick={handleGoogleLogin}
        disabled={loginStarting || authStatus !== null}
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
          cursor: loginStarting || authStatus !== null ? 'wait' : 'pointer',
          opacity: loginStarting || authStatus !== null ? 0.65 : 1,
        }}
      >
        <Image
          src="https://upload.wikimedia.org/wikipedia/commons/4/4a/Logo_2013_Google.png"
          alt="Google"
          width={20}
          height={20}
        />
        Войти через Google
      </button>
    </div>
  );
}
