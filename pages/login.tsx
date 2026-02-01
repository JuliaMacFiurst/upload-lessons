import { useState, useEffect } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';

export default function Login() {
  const supabase = useSupabaseClient();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.replace('/admin/upload-lesson');
    }
  }, [session, router]);

  if (session) return null;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      alert('Ошибка входа: ' + error.message);
    } else {
      setSent(true);
    }
  };

  const handleOAuthLogin = async (provider: 'github' | 'google') => {
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) {
      alert('Ошибка входа: ' + error.message);
    }
  };

  return (
    <div style={{ padding: 40, maxWidth: 400, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 24 }}>Вход в систему</h1>

      <button
        onClick={() => handleOAuthLogin('github')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          backgroundColor: '#24292e',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          width: '100%',
          marginBottom: 12,
          cursor: 'pointer',
        }}
      >
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg" alt="GitHub" style={{ width: 20 }} />
        Войти через GitHub
      </button>

      <button
        onClick={() => handleOAuthLogin('google')}
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

      <hr style={{ margin: '24px 0' }} />

      {sent ? (
        <p>Письмо с ссылкой для входа отправлено на {email}</p>
      ) : (
        <form onSubmit={handleEmailLogin}>
          <input
            type="email"
            placeholder="Введите email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: 10,
              width: '100%',
              marginBottom: 12,
              borderRadius: 4,
              border: '1px solid #ccc',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 16px',
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              width: '100%',
              cursor: 'pointer',
            }}
          >
            Войти по ссылке
          </button>
        </form>
      )}
    </div>
  );
}
import { GetServerSidePropsContext } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const supabase = createServerSupabaseClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
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