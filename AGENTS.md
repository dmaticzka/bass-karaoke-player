# Agent Instructions

## Repository layout

```
backend/app/      FastAPI app (main.py, audio_processor.py, models.py, storage.py)
backend/tests/    pytest unit tests
e2e/              Playwright E2E tests (NOT run by pre-commit)
frontend/         React 19 + TypeScript + Vite SPA (separate npm package)
frontend/dist/    build output; served by backend at /static/
```

No root `package.json`. All Node tooling is scoped to `frontend/`.  
Backend requires `PYTHONPATH=.` for imports; managed with `uv` (Python ≥ 3.14).

## Development workflow

### Feature branches

Always check `git branch` before starting. If on `main`, create a branch:

```
git checkout -b feat/<short-description>
```

### TDD

1. Write failing tests that specify the desired behaviour
2. Verify the tests fail before implementing
3. Implement until all tests pass

### Commit regularly

After each meaningful unit of work, using [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short description>
```

Common types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.

## Commands

### Frontend (run from `frontend/`)

| Purpose | Command |
|---|---|
| Install deps | `npm ci` |
| Run tests (once) | `npm test` |
| Run tests (watch) | `npm run test:watch` |
| Typecheck + bundle | `npm run build` |

Run a single test file: `npm test -- src/test/components/Foo.test.tsx`

### Backend (run from repo root)

| Purpose | Command |
|---|---|
| Install all deps | `uv sync --group dev` |
| Run tests | `PYTHONPATH=. uv run pytest` |
| Lint | `uv run ruff check backend/` |
| Format check | `uv run ruff format --check backend/` |
| Format fix | `uv run ruff format backend/` |
| Type check | `uv run mypy backend/app/ --ignore-missing-imports` |

Run a single test: `PYTHONPATH=. uv run pytest backend/tests/test_api.py::test_name -v`

Backend test coverage threshold is **95%** — falling below fails the run.

### E2E (not enforced by pre-commit)

```
PYTHONPATH=. FRONTEND_DIR=frontend/dist uv run pytest e2e/ -v --no-cov
```

Requires a built frontend (`npm run build` in `frontend/`) and `ffmpeg` installed.

## Pre-commit hook

`.githooks/pre-commit` is already active (`git config core.hooksPath .githooks`).  
It runs on every commit in this order, aborting on first failure:

1. Frontend Vitest tests
2. Frontend TypeScript build
3. `ruff check`
4. `ruff format --check`
5. `mypy`
6. `pytest` (backend only, with coverage)

No need to run checks manually before committing.

## Quirks

- **Frontend dev proxy**: `vite.config.ts` proxies `/api` and `/static` to `http://localhost:8000`. Start the backend before running `npm run dev`.
- **Service worker**: hand-written at `frontend/src/sw.ts`; `vite-plugin-pwa` injects the precache manifest into it at build time. Do not edit the precache list manually.
- **mypy is strict**: `strict = true` in `pyproject.toml`. All new backend code must be fully typed.
- **Vitest setup file**: `frontend/src/test/setup.ts` — check it before adding new test globals.

## Docker image (run from repo root, only after all checks pass)

```
time docker build . --tag ghcr.io/dmaticzka/bass-karaoke-player:dev
```
