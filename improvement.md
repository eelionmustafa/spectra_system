You are working on SPECTRA Risk Intelligence — a credit risk monitoring platform.
Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS, FastAPI, SQL Server.

TASK: Optimize the entire system for best performance. Do not change any UI or business logic.

FRONTEND (Next.js):
1. Convert all data-fetching pages to async Server Components where possible
2. Wrap all client-side data fetching with @tanstack/react-query (staleTime: 30_000, refetchOnWindowFocus: false)
3. Lazy load all heavy tab content using next/dynamic with loading skeletons
4. Memoize all list row components with React.memo
5. Fix all Recharts imports to named imports only (no import *)
6. Make sure next.config.ts has turbopack enabled: "dev": "next dev --turbopack"

BACKEND (FastAPI):
1. Add SQLAlchemy connection pooling: pool_size=10, max_overflow=20, pool_pre_ping=True, pool_recycle=3600
2. Wrap all Claude API generation calls in BackgroundTasks so endpoints return immediately
3. Add 30-second in-memory cache on: /api/portfolio/kpis, /api/dashboard, /api/clients (list)
4. Run uvicorn with --workers 4

DATABASE (SQL Server):
Generate a migration SQL file with indexes for:
- Clients(Stage, RiskScore)
- EWISignals(ClientID)
- AIGeneratedContent(ClientID, ContentType)
- EWIPredictions(ClientID)
- EWIRecommendations(ClientID, IsActioned)

RULES:
- Do not modify any UI components, page layouts, or business logic
- Do not touch the sidebar, navbar, or routing
- After listing every file you will create or modify, wait for my approval before writing code