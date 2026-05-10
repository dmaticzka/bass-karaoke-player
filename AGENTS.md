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

Frontend tests, frontend build (type-check), ruff, mypy, and pytest are enforced automatically by the pre-commit hook in `.githooks/pre-commit`. The hook is activated via `git config core.hooksPath .githooks` (already set in this repo).

### Docker image (run from repository root)

Only after all checks pass:

```
time docker build . --tag ghcr.io/dmaticzka/bass-karaoke-player:dev
```
