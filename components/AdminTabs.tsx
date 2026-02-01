

import Link from "next/link";
import { useRouter } from "next/router";

export function AdminTabs() {
  const router = useRouter();

  const tabs = [
    { href: "/admin/upload-lesson", label: "Upload lesson" },
    { href: "/admin/upload-video", label: "Upload video" },
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
        const isActive = router.pathname === tab.href;

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