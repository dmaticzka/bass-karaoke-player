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

Every session of development work must conclude with the following two steps, in order:

### 1. Build the Docker image

```
time docker build . --tag ghcr.io/dmaticzka/bass-karaoke-player:dev
```

Run from the repository root (`/var/home/tzk/co/bass-karaoke-player`).

### 2. Deploy via docker compose

```
docker compose up
```

Run from `../heimdal/workloads/bkpdev` (relative to the repository root).
