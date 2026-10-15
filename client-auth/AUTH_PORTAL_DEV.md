# Auth Portal — AGENT.ONE

## Architecture

Separate Vite + React app in `client-auth/`. Independent from the main
`client/` frontend. Builds to `dist-auth/` at the project root.

### Why separate?

- Zero risk to the existing main frontend
- Independent dependency tree
- Standard URLs (`/login`, `/register`) via `react-router-dom` BrowserRouter
- Can be served by a different nginx `server_name` block

## Directory structure

```
client-auth/
├── index.html              # HTML entry
├── package.json            # Dependencies (react, react-router-dom, vite)
├── vite.config.js          # Builds to ../dist-auth
├── AUTH_PORTAL_DEV.md      # This file
└── src/
    ├── main.jsx            # React entry + BrowserRouter
    ├── App.jsx             # Routes (/login, /register, * → /login)
    ├── styles/
    │   └── auth.css        # All styles
    ├── components/
    │   ├── AuthLayout.jsx   # Card wrapper with logo, title, error banner
    │   └── PasswordInput.jsx # Input with show/hide toggle + strength meter
    └── pages/
        ├── LoginPage.jsx   # /login
        └── RegisterPage.jsx # /register
```

## Commands

### Local development

```bash
cd client-auth
npm install
npm run dev
```

Opens on `http://localhost:5180`.

### Production build

```bash
cd client-auth
npm run build
```

Output: `dist-auth/` at the project root:

```
dist-auth/
├── index.html
├── assets/index-*.css
└── assets/index-*.js
```

## Environment variables

None at this stage. When backend integration is added:

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `/api` | Backend API base URL |

## Verifying the build

```bash
cd client-auth
npm run preview
```

Serves `dist-auth/` on `http://localhost:5180` with SPA fallback
(`/login` and `/register` work on direct open).

## Backend integration (future)

1. Replace the placeholder submit handlers in `LoginPage.jsx` and
   `RegisterPage.jsx` with real API calls to `POST /api/auth/signin`
   and `POST /api/auth/signup`.

2. On success, redirect to `https://example.com/?auth=success` (main app
   will detect the token and authenticate).

3. The refresh token cookie will be set by the backend on
   `auth.example.com` (same-site with example.com).

4. CORS: add `https://auth.example.com` to `CORS_ORIGINS` on the backend.

## Nginx deployment (future)

On production, the auth portal is served by `auth.example.com` nginx config:

```nginx
root /app/dist-auth;

location / {
    try_files $uri $uri/ /index.html;
}
```
