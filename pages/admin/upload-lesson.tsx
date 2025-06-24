import { useState, useEffect, useRef, DragEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { createClient } from '@supabase/supabase-js';
import slugify from 'slugify';
import { z } from 'zod';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CATEGORIES = [
  { name: 'Мультяшные персонажи', slug: 'cartoon-characters' },
  { name: 'Каваийные милашки', slug: 'kawaii' },
  { name: 'Сцены природы', slug: 'nature-scenes' },
  { name: 'Ботанические композиции', slug: 'botanical' },
  { name: 'Дессерты', slug: 'desserts' },
  { name: 'Знаки Зодиака', slug: 'zodiac' },
  { name: 'Лица', slug: 'faces' },
  { name: 'Наряды', slug: 'outfits' },
  { name: 'Мандала', slug: 'mandala' },
  { name: 'Фигуры в движении', slug: 'motion' },
  { name: 'Динозавры', slug: 'dinosaurs' },
  { name: 'Животные', slug: 'animals' },
  { name: 'Мемы и брейнроты', slug: 'memes' },
  { name: 'Аниме лица', slug: 'anime-faces' },
  { name: 'Рисование рук', slug: 'hands' },
  { name: 'Городские пейзажи', slug: 'cityscapes' },
];

const LessonSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  slug: z.string().min(1, 'Slug обязателен'),
  previewFile: z.instanceof(File, { message: 'Preview обязателен' }),
  steps: z.array(
    z.object({
      frank: z.string().min(1, 'Текст обязателен'),
      image: z.instanceof(File, { message: 'Картинка обязательна' })
    })
  ).min(1, 'Нужно хотя бы одно изображение')
});

export default function UploadLesson() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (!session) {
      router.replace('/login');
    }
  }, [session]);

  const [category, setCategory] = useState('animals');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ frank: string; image: File | null }[]>([{ frank: '', image: null }]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ title?: boolean; slug?: boolean; previewFile?: boolean; steps: boolean[] }>({ title: false, slug: false, previewFile: false, steps: [] });

  const [isDragging, setIsDragging] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // DnD-kit sensors and drag handler
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = active.id;
      const newIndex = over.id;
      setSteps((items) => arrayMove(items, oldIndex, newIndex));
    }
  };

  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'image/png');

      if (!files.length) return;

      const isPreview = files.some(f => f.name.toLowerCase() === 'preview.png');
      const stepFiles = files.filter(f => f.name.toLowerCase() !== 'preview.png');

      if (isPreview) {
        const preview = files.find(f => f.name.toLowerCase() === 'preview.png');
        if (preview) {
          setPreviewFile(preview);
          setPreviewUrl(URL.createObjectURL(preview));
        }
      }

      if (stepFiles.length) {
        const newSteps = [...steps];
        stepFiles.forEach(file => {
          const emptyIndex = newSteps.findIndex(s => s.image === null);
          if (emptyIndex !== -1) {
            newSteps[emptyIndex].image = file;
          } else {
            newSteps.push({ frank: '', image: file });
          }
        });
        setSteps(newSteps);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const current = dropRef.current;
    if (current) {
      current.addEventListener('dragover', handleDragOver as any);
      current.addEventListener('drop', handleDrop as any);
      current.addEventListener('dragleave', handleDragLeave as any);
    }

    return () => {
      if (current) {
        current.removeEventListener('dragover', handleDragOver as any);
        current.removeEventListener('drop', handleDrop as any);
        current.removeEventListener('dragleave', handleDragLeave as any);
      }
    };
  }, [steps]);
  useEffect(() => {
    const generatedSlug = slugify(title, { lower: true, strict: true });
    setSlug(generatedSlug);
  }, [title]);

  const uploadFile = async (path: string, file: File) => {
    const { error } = await supabase.storage.from('lessons').upload(path, file, {
      cacheControl: '3600',
      upsert: true
    });
    if (error) throw error;
  };

  const handleSubmit = async () => {
    try {
      const validated = LessonSchema.parse({
        title,
        slug,
        previewFile,
        steps: steps.map(s => ({
          frank: s.frank,
          image: s.image
        }))
      });
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const issues = validationError.issues;
        const stepErrors = steps.map((_, i) =>
          !!issues.find(e => e.path[0] === 'steps' && e.path[1] === i)
        );
        setErrors({
          title: !!issues.find(e => e.path[0] === 'title'),
          slug: !!issues.find(e => e.path[0] === 'slug'),
          previewFile: !!issues.find(e => e.path[0] === 'previewFile'),
          steps: stepErrors
        });
        alert('Пожалуйста, исправьте ошибки в форме.');
        return;
      }
    }

    setLoading(true);
    try {
      const folderPath = `${category}/${slug}`;
      await uploadFile(`${folderPath}/preview.png`, new File([previewFile!], 'preview.png', { type: previewFile!.type }));

      const stepData = await Promise.all(
        steps.map(async (step, index) => {
          if (!step.image) throw new Error(`Отсутствует изображение для шага ${index + 1}`);
          const stepFileName = `${String(index + 1).padStart(2, '0')}.png`;
          const stepPath = `${folderPath}/steps/${stepFileName}`;
          const renamedStepFile = new File([step.image], stepFileName, { type: step.image.type });
          await uploadFile(stepPath, renamedStepFile);
          return {
            frank: step.frank,
            image: `steps/${stepFileName}`
          };
        })
      );

      const { error } = await supabase.from('lessons').insert([
        {
          title,
          slug,
          category: CATEGORIES.find(c => c.slug === category)?.name || '',
          category_slug: category,
          preview: `preview.png`,
          steps: stepData
        }
      ]);
      if (error) throw error;
      alert('Урок успешно загружен!');
      setTitle(''); setSlug(''); setPreviewFile(null); setPreviewUrl(null); setSteps([{ frank: '', image: null }]);
      setErrors({ title: false, slug: false, previewFile: false, steps: [] });
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert('Ошибка загрузки: ' + err.message);
      } else {
        alert('Произошла неизвестная ошибка при загрузке.');
      }
    }
    setLoading(false);
  };

  // --- CSV export handler ---
  const handleExportCSV = () => {
    if (!title || !slug || steps.length === 0) {
      alert('Сначала заполните данные для экспорта.');
      return;
    }

    const rows = [
      ['title', 'slug', 'category', 'category_slug'],
      [title, slug, CATEGORIES.find(c => c.slug === category)?.name || '', category],
      [],
      ['step', 'frank', 'image']
    ];

    steps.forEach((step, i) => {
      rows.push([`step${i + 1}`, step.frank, step.image?.name || '']);
    });

    const csvContent = rows.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${slug}-lesson.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!session) return null;
  return (
    <div
      className="container"
      ref={dropRef}
      style={{
        border: isDragging ? '3px dashed #aaa' : undefined,
        backgroundColor: isDragging ? '#f9f9f9' : undefined,
        transition: 'all 0.2s ease'
      }}
    >
      <h1>Загрузка нового урока</h1>

      <label>Категория</label>
      <select value={category} onChange={e => setCategory(e.target.value)}>
        {CATEGORIES.map(cat => (
          <option key={cat.slug} value={cat.slug}>
            {cat.name}
          </option>
        ))}
      </select>

      <label>Название урока</label>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={errors.title ? { border: '1px solid red' } : {}}
      />

      <label>Slug (на английском)</label>
      <input
        value={slug}
        onChange={e => setSlug(e.target.value)}
        style={errors.slug ? { border: '1px solid red' } : {}}
      />

      <label>Preview.png</label>
      <input
        type="file"
        accept="image/png"
        onChange={e => {
          const file = e.target.files?.[0] || null;
          setPreviewFile(file);
          if (file) {
            setPreviewUrl(URL.createObjectURL(file));
          } else {
            setPreviewUrl(null);
          }
        }}
        style={errors.previewFile ? { border: '1px solid red' } : {}}
      />
      {previewUrl && (
        <img src={previewUrl} alt="Preview" style={{ maxWidth: '200px', marginTop: '10px' }} />
      )}

      <h2>Шаги</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map((_, i) => i)} strategy={verticalListSortingStrategy}>
          {steps.map((step, i) => {
            const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: i });
            const style = {
              transform: CSS.Transform.toString(transform),
              transition
            };
            return (
              <div
                key={i}
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
              >
                <label>Текст Фрэнка:</label>
                <input
                  value={step.frank}
                  onChange={e => {
                    const copy = [...steps];
                    copy[i].frank = e.target.value;
                    setSteps(copy);
                  }}
                  style={errors.steps[i] && !step.frank ? { border: '1px solid red' } : {}}
                />
                <label>Картинка ({String(i + 1).padStart(2, '0')}.png):</label>
                <input
                  type="file"
                  accept="image/png"
                  onChange={e => {
                    const copy = [...steps];
                    copy[i].image = e.target.files?.[0] || null;
                    setSteps(copy);
                  }}
                  style={errors.steps[i] && !step.image ? { border: '1px solid red' } : {}}
                />
                {step.image && (
                  <img
                    src={URL.createObjectURL(step.image)}
                    alt={`Шаг ${i + 1}`}
                    style={{ maxWidth: '150px', marginTop: '5px', display: 'block' }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Удалить шаг ${i + 1}?`)) {
                      const newSteps = [...steps];
                      newSteps.splice(i, 1);
                      setSteps(newSteps);
                    }
                  }}
                >
                  ❌ Удалить шаг
                </button>
              </div>
            );
          })}
        </SortableContext>
      </DndContext>

      <button onClick={() => setSteps([...steps, { frank: '', image: null }])}>
        + Добавить шаг
      </button>

      <br />
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Загрузка...' : 'Сохранить урок'}
      </button>
      <button onClick={handleExportCSV}>
        📄 Экспортировать в CSV
      </button>
    </div>
  );
}