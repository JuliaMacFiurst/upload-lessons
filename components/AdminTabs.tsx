

import Link from "next/link";
import { useRouter } from "next/router";

export function AdminTabs() {
  const router = useRouter();

  const tabs = [
    { href: "/admin/upload-lesson", label: "Уроки" },
    { href: "/admin/upload-video", label: "Видео" },
    { href: "/admin/translations", label: "Переводы" },
    { href: "/admin/books", label: "Книги" },
    { href: "/admin/story-builder", label: "Истории" },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        marginBottom: 32,
        borderBottom: "1px solid #e5e5e5",
      }}
    >
      {tabs.map((tab) => {
        const isActive =
          router.pathname === tab.href ||
          (tab.href === "/admin/books" && router.pathname.startsWith("/admin/books")) ||
          (tab.href === "/admin/story-builder" && router.pathname.startsWith("/admin/story-builder"));

        return (
          <Link key={tab.href} href={tab.href} legacyBehavior>
            <a
              style={{
                padding: "8px 4px",
                textDecoration: "none",
                color: "inherit",
                borderBottom: isActive
                  ? "2px solid black"
                  : "2px solid transparent",
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </a>
          </Link>
        );
      })}
    </div>
  );
}
