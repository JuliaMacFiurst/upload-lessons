import { useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { isAllowedAdminEmail } from '../lib/server/admin-session';

export default function Login() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const getRedirectPath = () => {
    const nextParam = typeof router.query.next === 'string' ? router.query.next : '';
    if (nextParam.startsWith('/')) {
      return nextParam;
    }
    return '/admin/upload-lesson';
  };

  const handleGoogleLogin = async () => {
    const redirectPath = getRedirectPath();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          typeof window === 'undefined'
            ? undefined
            : `${window.location.origin}${redirectPath}`,
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
import { GetServerSidePropsContext } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const supabase = createServerSupabaseClient(ctx);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAllowedAdminEmail(user.email)) {
    return {
      redirect: {
        destination: '/admin/upload-lesson',
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
}
