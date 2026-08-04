This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

## Admin access

Admin access uses Supabase Auth plus a server-only, comma-separated email allowlist:

```dotenv
ADMIN_EMAILS=owner@example.com,second-admin@example.com
```

`ADMIN_EMAIL` remains supported as a temporary fallback when `ADMIN_EMAILS` is absent. Values are trimmed, lowercased, and compared as complete email addresses. Do not prefix `ADMIN_EMAILS` with `NEXT_PUBLIC_` and never expose the Supabase service-role key to the browser.

Only existing/invited Supabase Auth users should be allowed to sign in. Keep public registration disabled in Supabase Auth; the application exposes Google sign-in but no sign-up form. Invite each administrator in Supabase before granting access.

For local development, copy `.env.example` to `.env.local` and provide the real server credentials and allowlist. Do not commit `.env.local` or real secrets.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

In Vercel Project Settings → Environment Variables, set `ADMIN_EMAILS` for Production and also for Preview and Development when those environments are used. Keep `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-only. After changing any environment variable, redeploy the affected environment; an existing deployment does not pick up the new value automatically.

Apply pending Supabase migrations separately through the normal reviewed deployment workflow. The admin migration keeps RLS enabled and extends the existing `public.is_admin()` contract used by table and Storage policies.
