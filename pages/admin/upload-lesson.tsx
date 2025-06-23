// pages/admin/upload-lesson.tsx

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORIES = [
  'Животные', 'Растения', 'Еда', 'Транспорт', 'Космос', 'Праздники',
  'Фантазия', 'Лица', 'Дом', 'Одежда', 'Инструменты', 'Природа',
  'Профессии', 'Эмоции', 'Морское', 'Разное'
];

export default function UploadLesson() {
  const [category, setCategory] = useState('Животные');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<{ frank: string; image: File | null }[]>([{ frank: '', image: null }]);
  const [loading, setLoading] = useState(false);

  const uploadFile = async (path: string, file: File) => {
    const { error } = await supabase.storage.from('lessons').upload(path, file, {
      cacheControl: '3600',
      upsert: true
    });
    if (error) throw error;
  };

  const handleSubmit = async () => {
    if (!title || !slug || !previewFile) return alert('Пожалуйста, заполните все поля');
    setLoading(true);
    try {
      const folderPath = `${category}/${slug}`;
      await uploadFile(`${folderPath}/preview.png`, previewFile);

      const stepData = await Promise.all(
        steps.map(async (step, index) => {
          if (!step.image) throw new Error(`Отсутствует изображение для шага ${index + 1}`);
          const stepPath = `${folderPath}/steps/step${index + 1}.png`;
          await uploadFile(stepPath, step.image);
          return {
            frank: step.frank,
            image: `steps/step${index + 1}.png`
          };
        })
      );

      const { error } = await supabase.from('lessons').insert([
        {
          title,
          slug,
          category,
          preview: `preview.png`,
          steps: stepData
        }
      ]);
      if (error) throw error;
      alert('Урок успешно загружен!');
      setTitle(''); setSlug(''); setPreviewFile(null); setSteps([{ frank: '', image: null }]);
    } catch (err: any) {
      alert('Ошибка загрузки: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Загрузка нового урока</h1>

      <label className="block mb-2">Категория</label>
      <select value={category} onChange={e => setCategory(e.target.value)} className="mb-4 w-full border p-2">
        {CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
      </select>

      <label className="block mb-2">Название урока</label>
      <input value={title} onChange={e => setTitle(e.target.value)} className="mb-4 w-full border p-2" />

      <label className="block mb-2">Slug (на английском)</label>
      <input value={slug} onChange={e => setSlug(e.target.value)} className="mb-4 w-full border p-2" />

      <label className="block mb-2">Preview.png</label>
      <input type="file" accept="image/png" onChange={e => setPreviewFile(e.target.files?.[0] || null)} className="mb-4" />

      <h2 className="text-xl font-semibold mb-2">Шаги</h2>
      {steps.map((step, i) => (
        <div key={i} className="mb-4 border p-2">
          <label>Текст Фрэнка:</label>
          <input value={step.frank} onChange={e => {
            const copy = [...steps];
            copy[i].frank = e.target.value;
            setSteps(copy);
          }} className="mb-2 w-full border p-2" />

          <label>Картинка (step{i + 1}.png):</label>
          <input type="file" accept="image/png" onChange={e => {
            const copy = [...steps];
            copy[i].image = e.target.files?.[0] || null;
            setSteps(copy);
          }} />
        </div>
      ))}

      <button onClick={() => setSteps([...steps, { frank: '', image: null }])} className="bg-blue-500 text-white px-4 py-2 rounded mb-4">
        + Добавить шаг
      </button>

      <br />
      <button onClick={handleSubmit} disabled={loading} className="bg-green-500 text-white px-4 py-2 rounded">
        {loading ? 'Загрузка...' : 'Сохранить урок'}
      </button>
    </div>
  );
}