# GitHub Actions workflow (staged)

`ci.yml.txt` is a ready-to-use CI workflow for this repo, **but it can't be pushed automatically** because the deploy bot's Personal Access Token lacks the `workflow` scope.

## How to enable CI (one-time, ~30 seconds)

```bash
mkdir -p .github/workflows
cp .github-workflows-staged/ci.yml.txt .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "Add CI workflow"
git push origin main
```

If git rejects the push with "refusing to allow a Personal Access Token to create or update workflow", regenerate your PAT with the `workflow` scope checked in **GitHub → Settings → Developer settings → Personal access tokens**, then `git remote set-url origin https://<username>:<new-pat>@github.com/...` and push again.

## What the CI does

- **backend-tests**: `npm ci && npm test` (runs all 16 `node --test` cases)
- **frontend-build**: `npm ci && npx expo export --platform web` (smoke build)

Both jobs run on every push to `main` and on PRs targeting `main`.
