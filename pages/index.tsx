import Link from 'next/link';

export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Добро пожаловать!</h1>
      <p>
        Это тестовая загрузочная панель уроков. Перейдите в{' '}
        <Link href="/admin/upload-lesson">/admin/upload-lesson</Link>.
      </p>
    </div>
  );
}