import { useState, useEffect, useRef, DragEvent } from 'react';
import Link from 'next/link';
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
import type { DragEndEvent } from '@dnd-kit/core';
import slugify from 'slugify';
import { z } from 'zod';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import React from 'react';

function Spinner() {
  return (
    <svg className="spinner" viewBox="0 0 50 50">
      <circle
        className="path"
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth="5"
      />
    </svg>
  );
}
type SortableStepProps = {
  index: number;
  step: { frank: string; image: File | null };
  onChangeFrank: (val: string) => void;
  onChangeImage: (file: File | null) => void;
  onDelete: () => void;
  error: { frank?: boolean; image?: boolean };
};

const Component = ({ index, step, onChangeFrank, onChangeImage, onDelete, error }: SortableStepProps) => {
    return (
      <div className="step-block">
        <label className="form-label">Текст Фрэнка:</label>
        <input
          value={step.frank}
          onChange={e => onChangeFrank(e.target.value)}
          className={`form-input ${error.frank ? 'error-border' : ''}`}
        />
        <label className="form-label">Картинка ({String(index + 1).padStart(2, '0')}.png):</label>
        <input
          type="file"
          accept="image/png"
          onChange={e => onChangeImage(e.target.files?.[0] || null)}
          className={`form-input ${error.image ? 'error-border' : ''}`}
        />
        {step.image && (
          <img
            src={URL.createObjectURL(step.image)}
            alt={`Шаг ${index + 1}`}
            className="step-image"
          />
        )}
        <button type="button" className="btn btn-danger" onClick={() => {
          if (confirm(`Удалить шаг ${index + 1}?`)) onDelete();
        }}>
          ❌ Удалить шаг
        </button>
      </div>
    );
};

const SortableStep: React.FC<SortableStepProps> = React.memo(Component);
SortableStep.displayName = 'SortableStep';


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

const UploadLesson = () => {
  const router = useRouter();
  const session = useSession();
  const supabaseClient = useSupabaseClient();

  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      router.replace('/login');
    }
  }, [session, router]);

  const [category, setCategory] = useState('animals');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ id: string; frank: string; image: File | null }[]>([
    { id: crypto.randomUUID(), frank: '', image: null }
  ]);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const oldIndex = steps.findIndex(s => s.id === active.id);
    const newIndex = steps.findIndex(s => s.id === over?.id);
    if (oldIndex !== -1 && newIndex !== -1) {
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
            newSteps.push({ id: crypto.randomUUID(), frank: '', image: file });
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
      current.addEventListener('dragover', handleDragOver as unknown as EventListener);
      current.addEventListener('drop', handleDrop as unknown as EventListener);
      current.addEventListener('dragleave', handleDragLeave as unknown as EventListener);
    }

    return () => {
      if (current) {
        current.removeEventListener('dragover', handleDragOver as unknown as EventListener);
        current.removeEventListener('drop', handleDrop as unknown as EventListener);
        current.removeEventListener('dragleave', handleDragLeave as unknown as EventListener);
      }
    };
  }, [steps]);
  useEffect(() => {
    const generatedSlug = slugify(title, { lower: true, strict: true });
    setSlug(generatedSlug);
  }, [title]);

  const uploadFile = async (path: string, file: File) => {
    const sessionRes = await supabaseClient.auth.getSession();
    console.log('session for upload:', sessionRes.data.session);

    const { error } = await supabaseClient.storage.from('lessons').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (error) {
      console.error('Ошибка при загрузке файла:', path, error.message);
      throw error;
    }
  };

  const handleSubmit = async () => {
    try {
      LessonSchema.parse({
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
      console.log('Uploading previewFile:', previewFile);
      await uploadFile(`${folderPath}/preview.png`, new File([previewFile!], 'preview.png', { type: 'image/png' }));

      const stepData = await Promise.all(
        steps.map(async (step, index) => {
          if (!step.image) throw new Error(`Отсутствует изображение для шага ${index + 1}`);
          const stepFileName = `${String(index + 1).padStart(2, '0')}.png`;
          const stepPath = `${folderPath}/steps/${stepFileName}`;
          const renamedStepFile = new File([step.image], stepFileName, { type: step.image.type });
          await uploadFile(stepPath, renamedStepFile);
          return {
            frank: step.frank,
            image: `${folderPath}/steps/${stepFileName}`
          };
        })
      );

      const { error } = await supabaseClient.from('lessons').insert([
        {
          title,
          slug,
          category: CATEGORIES.find(c => c.slug === category)?.name || '',
          category_slug: category,
          preview: `${folderPath}/preview.png`,
          steps: stepData
        }
      ]);
      if (error) throw error;
      alert('Урок успешно загружен!');
      setTitle(''); setSlug(''); setPreviewFile(null); setPreviewUrl(null); setSteps([{ id: crypto.randomUUID(), frank: '', image: null }]);
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
      const stepFileName = `${String(i + 1).padStart(2, '0')}.png`;
      rows.push([`step${i + 1}`, step.frank, step.image ? stepFileName : '']);
    });

    const csvContent = rows.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${slug}-lesson.csv`);
    document.body.appendChild(link);
    link.click();
    setShareUrl(url);
    document.body.removeChild(link);
  };

  if (!session) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Сессия истекла или вы не авторизованы.</p>
        <Link href="/login" legacyBehavior>
          <a style={{
            display: 'inline-block',
            marginTop: '1rem',
            padding: '0.6rem 1.2rem',
            backgroundColor: '#ffadad',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: 'bold'
          }}>
            Перейти к входу
          </a>
        </Link>
      </div>
    );
  }
  return (
    <div className="upload-page">
      <div
        className="container upload-container form-container"
        ref={dropRef}
        data-dragging={isDragging ? 'true' : 'false'}
      >
        <button
        onClick={async () => {
          await supabaseClient.auth.signOut();
          router.push('/login');
        }}
        className="btn btn-logout"
      >
        Выйти
      </button>
        <h1 className="page-title">Загрузка нового урока</h1>
      <div className="form-container">
        <label className="form-label">Категория</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="form-select">
          {CATEGORIES.map(cat => (
            <option key={cat.slug} value={cat.slug}>
              {cat.name}
            </option>
          ))}
        </select>

        <label className="form-label">Название урока</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={`form-input ${errors.title ? 'error-border' : ''}`}
        />

        <label className="form-label">Slug (на английском)</label>
        <input
          value={slug}
          onChange={e => setSlug(e.target.value)}
          className={`form-input ${errors.slug ? 'error-border' : ''}`}
        />

        <label className="form-label">Preview.png</label>
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
          className={`form-input ${errors.previewFile ? 'error-border' : ''}`}
        />
        {previewUrl && (
          <img src={previewUrl} alt="Preview" className="preview-image" />
        )}
        <h2 className="steps-title">Шаги</h2>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {steps.map((step, i) => (
              <SortableStep
                key={step.id}
                index={i}
                step={step}
                onChangeFrank={(val) => {
                  const copy = [...steps];
                  copy[i].frank = val;
                  setSteps(copy);
                }}
                onChangeImage={(file) => {
                  const copy = [...steps];
                  copy[i].image = file;
                  setSteps(copy);
                }}
                onDelete={() => {
                  const newSteps = [...steps];
                  newSteps.splice(i, 1);
                  setSteps(newSteps);
                }}
                error={{
                  frank: errors.steps[i] && !step.frank,
                  image: errors.steps[i] && !step.image
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
</div>
        <button onClick={() => setSteps([...steps, { id: crypto.randomUUID(), frank: '', image: null }])} className="btn btn-secondary">
          + Добавить шаг
        </button>

        <br />
        <button onClick={handleSubmit} disabled={loading} className="btn btn-primary">
          {loading ? <Spinner /> : 'Сохранить урок'}
        </button>
        <button onClick={handleExportCSV} className="btn btn-primary">
          📄 Экспортировать в CSV
        </button>
        {shareUrl && (
          <div style={{ marginTop: '10px' }}>
            <p>CSV-файл готов!</p>
            <button onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              alert('Ссылка скопирована в буфер обмена!');
            }} className="btn btn-primary">
              📎 Поделиться ссылкой на файл
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default UploadLesson;