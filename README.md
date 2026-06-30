<div align="center">

# Creed

**One file across every agent.**

Your personal context, written once and kept polished by your agents — so every AI you talk to knows you instantly.

[Website](https://creed.md)

</div>

---

## What is Creed?

Anyone using AI seriously hits the same tax: re-explaining themselves every chat, every tool, every session.

Creed kills that tax with one file.

You write yourself down once — your role, goals, preferences, routines, the people who matter, anything you want every AI to know — and connected agents read that file before they answer you. As they learn new things about you, they propose updates. You approve the good ones. The file sharpens over time.

It's not a notes app. It's not a journal. It's not a memory dump. It's a curated personal-context profile, sized to fit on one page, that travels with you across Claude, ChatGPT, Codex, Cursor, OpenClaw, Hermes, OpenCode, and any custom agent you wire up.

---

## Why Creed exists

There's a small set of tools every AI-native person re-invents for themselves: a "system prompt" that grows in their notes, a `CLAUDE.md` they paste into every project, a list of "things ChatGPT keeps getting wrong about me." Creed is what happens when you decide that file should be **a real product**, not a hack.

The file is plain Markdown. The app exists to:

- support invite-only sign-in and shared Markdown workspaces
- score quality and surface gaps (BYOK OpenRouter — never our tab)
- let agents read and propose updates without you copy-pasting
- keep one canonical version across every tool you use

If you've ever maintained a personal `creed.md` by hand, this is that, with the boring parts solved.

---

## How it works

```
┌──────────────────────┐         ┌────────────────────┐
│  You — invited login │ ──────► │  Your Creed file   │
│  or shared document  │         │  and Markdown docs  │
└──────────────────────┘         └─────────┬──────────┘
                                           │
                              ┌────────────┴────────────┐
                              ▼                         ▼
                  ┌─────────────────────┐    ┌──────────────────────┐
                  │  Agent reads it     │    │  Agent proposes an   │
                  │  before answering   │    │  update; you approve │
                  └─────────────────────┘    └──────────────────────┘
```

The file has 10 sections — five core, five optional — sized so the whole thing reads in under a minute:

| Always-on   | Optional      |
|-------------|---------------|
| Identity    | Beliefs       |
| Goals       | Constraints   |
| Work        | People        |
| Preferences | Health        |
| Routines    | Context       |

Every section is agent-writable. Every change goes through the review (or direct-edit, if you trust it).

---

## Status

Creed is in active development. This fork is invite-only, BYOK-only for AI, and does not expose public billing or signup.

---

## Run it locally

You'll need:

- **Node.js 20+**
- **a Supabase project** (free tier is fine)
- **an OpenRouter API key** (only needed for AI-powered quality analysis and refinement)

### 1. Clone and install

```bash
git clone https://github.com/<your-fork>/creed.git
cd creed
npm install
```

### 2. Configure environment

Copy the template and fill in values:

```bash
cp .env.example .env.local
```

`.env.example` documents every variable Creed reads. The minimum to boot the app:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
SUPABASE_SECRET_KEY=<your-supabase-service-role-key>
CREED_ENCRYPTION_SECRET=<base64-encoded-32-byte-secret>
```

Generate the encryption secret with `openssl rand -base64 32`.

Optional branding, GitHub integration, Resend notifications, and feedback variables are documented inline in `.env.example` — copy whichever ones you want to enable.

### 3. Run database migrations

```bash
# install Supabase CLI if you don't have it: brew install supabase/tap/supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates every table Creed needs (sections, proposals, activity, tokens, MCP, shared documents, comments, notifications, GitHub, AI usage, audit log, rate limits, and legacy entitlement tables) plus the row-level-security policies that make sure users only ever see their own data.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Signed-out users land on `/login`; signed-in users land on `/dashboard`.

### Deploying your own

If you're standing up a separate hosted Creed (not contributing back to this repo):

- Set `NEXT_PUBLIC_SITE_URL` to your deployed origin so OAuth callback and agent URLs resolve correctly.
- Set `CREED_CSP_ENFORCE=1` in production once you've watched one deploy cycle in Report-Only mode.
- The dormant example agent prompts in `lib/creed-data.ts` reference `https://creed.md` purely as illustration; real users see URLs derived from your `NEXT_PUBLIC_SITE_URL` at request time.

---

## Connect an agent

Once you have a Creed, open `/connections` and add the Creed MCP URL to your agent as a custom connector. The client opens a browser, you click **Allow** on the Creed consent screen, and it's connected. No tokens to copy. We have first-class flows for:

- Claude Code (a one-line `claude mcp add` command)
- Codex
- OpenClaw
- Hermes
- OpenCode
- Cursor (one-click "Add to Cursor")
- Custom Agent (any client that speaks MCP)

MCP uses OAuth 2.1: Creed is its own authorization server (`/authorize`, `/token`, `/register`, `/.well-known/*`), so any spec-compliant client connects from the server URL alone. The agent verifies it can read your file and starts shaping replies around it from the next message forward. For clients that don't speak MCP, the `/api/creed` HTTP API is the documented fallback.

---

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **Tiptap** for the rich-text editor
- **Framer Motion** for the calmer-than-normal interactions
- **Supabase** for auth, Postgres, RLS, realtime
- **OpenRouter** for BYOK AI

The stack is intentionally boring and self-hostable.

---

## Repository tour

```
app/                    Next.js routes (auth, app, API)
├── (creed-app)/        signed-in product (/dashboard, /file, /connections, /settings)
├── api/                session-authed and token-authed APIs
├── auth/callback/      OAuth callback
├── accept-invite/      invite completion
├── login/              auth front door
└── proxy.ts            request-id + path-aware request forwarding

components/
├── creed/              the product UI
├── marketing/          shared auth visual helpers
├── auth/               sign-in / invite / password screens
└── ui/                 shadcn primitives + Phosphor icon adapter

lib/
├── creed-data.ts       types, section IDs, agent contract
├── creed-backend.ts    Supabase reads/writes
├── ai/                 OpenRouter, model catalog, quality
└── supabase/           browser + server clients

supabase/migrations/    canonical schema
public/                 static assets
```

---

## Commands

```bash
npm run dev      # local dev server (Turbopack)
npm run build    # production build
npm run lint     # ESLint
npm run start    # serve a built app

npx tsc --noEmit -p .   # typecheck only
```

---

## Contributing

We'd love contributions. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a PR — it's short and saves both of us time.

If you're an AI agent picking up this codebase to make changes, read [`AGENTS.md`](./AGENTS.md) first instead. It's the same information, written for you.

---

## Security

Found a vulnerability? Please don't open a public issue. See [`SECURITY.md`](./SECURITY.md) for the responsible-disclosure path.

---

## License

[MIT](./LICENSE).
