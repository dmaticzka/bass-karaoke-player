# Publishing to GitHub Container Registry (ghcr.io)

The CI/CD workflows in this repository are already configured to build and push the Docker image to `ghcr.io/dmaticzka/bass-karaoke-player` automatically. This guide explains the one-time GitHub settings you need to enable for the publishing to work.

## How publishing works

| Workflow | Trigger | What it does |
|---|---|---|
| `auto-release.yml` | Push to `main` | Auto-bumps version tag, creates GitHub Release, pushes Docker image |
| `release.yml` | Push of a `v*.*.*` tag | Creates GitHub Release, pushes Docker image |

Both workflows use `GITHUB_TOKEN` — no additional secrets are required.

The image is tagged automatically:

| Tag | Example | When |
|---|---|---|
| `latest` | `ghcr.io/dmaticzka/bass-karaoke-player:latest` | Every publish |
| Full semver | `ghcr.io/dmaticzka/bass-karaoke-player:1.2.3` | Every publish |
| Minor | `ghcr.io/dmaticzka/bass-karaoke-player:1.2` | Every publish |
| Major | `ghcr.io/dmaticzka/bass-karaoke-player:1` | Every publish |

## Required GitHub configuration

### 1. Allow GitHub Actions to write packages

The `GITHUB_TOKEN` must have `packages: write` permission. The workflows already declare this permission, but you need to ensure it is not blocked at the repository level:

1. Open your repository on GitHub.
2. Go to **Settings → Actions → General**.
3. Scroll to **Workflow permissions**.
4. Select **Read and write permissions**.
5. Click **Save**.

> **Organisation repositories**: If the repository belongs to an organisation, an organisation admin may also need to set this at the organisation level under **Organisation Settings → Actions → General → Workflow permissions**.

### 2. Set the package visibility

The first time the image is pushed it will be **private** by default. To make it publicly accessible:

1. Go to your GitHub profile (or organisation page): `https://github.com/dmaticzka?tab=packages`.
2. Click on the **bass-karaoke-player** package.
3. Click **Package settings** (bottom-right).
4. Under **Danger Zone**, change the visibility to **Public**.

### 3. Link the package to the repository (recommended)

Linking the container package to the source repository improves discoverability and lets users find the image from the repository page:

1. Open the **bass-karaoke-player** package (step 2 above).
2. Click **Package settings**.
3. Under **Connect repository**, search for and select **dmaticzka/bass-karaoke-player**.
4. Click **Connect repository**.

## Verifying the setup

After your next push to `main` (or after pushing a `v*.*.*` tag), check that the workflow completed successfully:

1. Go to the **Actions** tab of the repository.
2. Open the latest **Auto Release** (or **Release**) run.
3. The **Build & Push Docker Image** job should finish with a green checkmark.

You can then pull the image locally:

```bash
docker pull ghcr.io/dmaticzka/bass-karaoke-player:latest
```

Or start the application directly without cloning the repository:

```bash
docker run -p 8000:8000 -v karaoke_data:/data ghcr.io/dmaticzka/bass-karaoke-player:latest
```
