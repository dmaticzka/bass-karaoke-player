# Agent Instructions

## Development Workflow

### Test-Driven Development

Always follow TDD:
1. Write failing tests that specify the desired behaviour
2. Verify the tests fail before implementing
3. Implement the feature until all tests pass

### Feature Branch

Always work on a feature branch. Check the current branch with `git branch` before starting. If on `main` (or `master`), create and switch to a new branch:

```
git checkout -b feat/<short-description>
```

### Commit Regularly

Commit after each meaningful unit of work. Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<optional scope>): <short description>
```

Common types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.

Examples:
- `feat(player): add Original audio mode`
- `fix(versions): correct cache indicator for original bubble`
- `test(VersionsPicker): add failing tests for original cache indicator`

## Completing Development Work

Before building the Docker image, run all individual build and test steps first to catch errors quickly without a full Docker build cycle.

### 1. Frontend (run from `frontend/`)

```
npm test
npm run build
```

`npm run build` runs `tsc -b && vite build` — the TypeScript compiler (`tsc`) will catch type errors that would otherwise only surface inside the Docker build.

### 2. Backend (run from repository root)

```
uv run ruff check backend/
uv run ruff format --check backend/
uv run mypy backend/app/ --ignore-missing-imports
uv run pytest
```

### 3. Docker image (run from repository root)

Only after all of the above pass:

```
time docker build . --tag ghcr.io/dmaticzka/bass-karaoke-player:dev
```
