# One-time CI setup

The file `docs/ci-workflow.yml.template` is the CI/CD workflow. It was pushed
here instead of `.github/workflows/ci.yml` because the initial GitHub Personal
Access Token lacked `workflow` scope.

**To activate it (takes 1 minute via GitHub web UI):**

1. Go to the repo on GitHub → click `Add file` → `Create new file`
2. Type path: `.github/workflows/ci.yml`
3. Paste the contents of `docs/ci-workflow.yml.template`
4. Commit directly to `main`

Or from a machine with a PAT that has `workflow` scope:
```
mkdir -p .github/workflows
git mv docs/ci-workflow.yml.template .github/workflows/ci.yml
git commit -m "Activate CI workflow"
git push
```
