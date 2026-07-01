import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/creed/theme-provider";
import { getSiteUrl } from "@/lib/supabase/env";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Share-card / search-result imagery, all via Next's filesystem convention:
// - `app/opengraph-image.png` is wired into `<meta property="og:image">`.
// - `app/twitter-image.png` is wired into `<meta name="twitter:image">`.
// - `app/favicon.ico` stays the browser-tab favicon. We pin it explicitly
//   under `icons.icon` so a future `app/icon.png` doesn't silently take over
//   and the search-result favicon Google reads stays the one users see in tabs.
const SITE_DESCRIPTION =
  "Creed is one personal context file that every AI reads before it answers. Written once, kept current by your agents, and portable across every tool you use.";

// The browser tab title is intentionally brand-free: `title.default` is empty
// for pages that set no title, and `title.template` is a bare "%s" so a
// page-specific title ("Pricing") is shown verbatim with no " | Creed" suffix.
// A page that wants an exact title can still use `title: { absolute: "..." }`.
// (Social/link-preview titles in openGraph/twitter below still carry the brand.)
export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "",
    template: "%s",
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    siteName: "Creed",
    title: "Creed",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Creed",
    description: SITE_DESCRIPTION,
  },
};

// The root layout is intentionally static: it holds no user state, reads no
// cookies/headers, and renders no CreedProvider. User-specific work
// (Supabase session, loadCreedState, CreedProvider) lives in <AuthedProviders>,
// pulled in only by the signed-in app shell.
export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply persisted theme before paint so dark mode doesn't flash.
            This is a server-rendered inline script - runs once during the
            initial HTML response, before React hydrates, so the dark-mode
            class is on <html> by the time anything else paints.
            `next/script` with strategy="beforeInteractive" was causing the
            page to hang in Next 16 dev. Inline <script> in <head> is the
            canonical no-flash pattern and works without ceremony. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('creed:theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
