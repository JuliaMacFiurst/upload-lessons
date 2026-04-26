
import Link from "next/link";
import { useRouter } from "next/router";

export function AdminTabs() {
  const router = useRouter();

  const tabs = [
    { href: "/admin/upload-lesson", label: "Уроки" },
    { href: "/admin/map-targets", label: "Карта" },
    { href: "/admin/artworks", label: "Художники" },
    { href: "/admin/upload-video", label: "Видео" },
    { href: "/admin/translations", label: "Переводы" },
    { href: "/admin/cat-questions", label: "Вопросы" },
    { href: "/admin/books", label: "Книги" },
    { href: "/admin/story-builder", label: "Истории" },
    { href: "/admin/story-submissions", label: "Заявки" },
  ];

  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      <div className="admin-tabs__list">
        {tabs.map((tab) => {
          const isActive =
            router.pathname === tab.href ||
            (tab.href === "/admin/map-targets" && router.pathname.startsWith("/admin/map-target")) ||
            (tab.href === "/admin/artworks" && router.pathname.startsWith("/admin/artworks")) ||
            (tab.href === "/admin/cat-questions" && router.pathname.startsWith("/admin/cat-questions")) ||
            (tab.href === "/admin/books" && router.pathname.startsWith("/admin/books")) ||
            (tab.href === "/admin/story-builder" && router.pathname.startsWith("/admin/story-builder")) ||
            (tab.href === "/admin/story-submissions" && router.pathname.startsWith("/admin/story-submissions"));

          return (
            <Link key={tab.href} href={tab.href} legacyBehavior>
              <a
                className={`admin-tabs__link ${isActive ? "admin-tabs__link--active" : ""}`}
              >
                {tab.label}
              </a>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
