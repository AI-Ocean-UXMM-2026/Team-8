# SET-02 — separate clones, task branches and write access

Status: local procedure prepared; shared GitHub write access is unverified. The previous migration push was denied. A successful clone proves read access only. No invitations, remote permission changes or successful team pushes are claimed here. Names/accounts need not be recorded to use this procedure.

## Access recovery

The repository administrator grants each teammate Write access to `AI-Ocean-UXMM-2026/Team-8` through the repository's people/team access settings. Each teammate accepts any pending invitation and authenticates with their own GitHub account, using Git Credential Manager's browser sign-in for HTTPS. Never share accounts or tokens. Complete organization SSO/2FA requirements if prompted.

If push is denied, check the account named in the error, repository access/invitation, organization authentication requirements and branch rules. A protected-default-branch rejection requires a task branch and PR, not disabling protection. Git commit name/email and the presence of Credential Manager do not prove authenticated write access. Do not repeatedly retry the migration push, force-push, or switch to shared credentials.

Official reference: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository

## One independent clone per teammate

Run these commands on each teammate's own machine in their chosen parent directory. Do not clone inside an existing checkout or share a OneDrive-synced working directory. If using one computer, use a distinct local directory and individual authenticated OS/GitHub session per teammate.

Example for FE1 (replace `fe1` with `fe2`, `be1` or `be2` for the other roles):

```powershell
git clone https://github.com/AI-Ocean-UXMM-2026/Team-8.git Team-8-fe1
cd Team-8-fe1
git remote -v
git fetch origin
git switch -c docs/SET-02-fe1-access origin/HEAD
```

`origin/HEAD` selects the remote default branch. If unavailable, inspect `git remote show origin` and use its actual default branch. If the destination exists, use the existing independent clone or a new unique directory; never overwrite it.

Already working in a clone? Save/review existing changes first. Do not discard them or include unrelated changes in an access PR. Create an appropriate task branch instead of recloning over the folder.

## Prove write access with a small task PR

On each role's access branch, create only its own harmless evidence file. FE1 example:

```powershell
New-Item -ItemType Directory -Force docs/team-access
'FE1: separate clone and task branch prepared; remote verification pending.' | Set-Content docs/team-access/fe1.md
git add -- docs/team-access/fe1.md
git commit -m "docs(SET-02): prepare FE1 access verification"
git push -u origin HEAD
```

Use `fe2.md`, `be1.md` or `be2.md` and matching branch/commit text for other roles. Do not use `git add .` for this check. The evidence file initially says pending deliberately: only after the push succeeds, open a PR against the default branch and record the successful push date, branch and PR link. Do not store tokens, authentication output or secrets. Use the normal peer reviews from SET-03; do not bypass required checks.

A dry-run or an up-to-date push is not sufficient evidence of a new branch write. If rejected, leave that role pending and ask the repository administrator to resolve access. A successful push by one role does not establish access for the others.

## Role-level verification register

| Role | Independent clone | Task branch | Successful new-branch push / PR evidence |
| --- | --- | --- | --- |
| FE1 | Pending | `docs/SET-02-fe1-access` (planned) | Pending |
| FE2 | Pending | `docs/SET-02-fe2-access` (planned) | Pending |
| BE1 | Pending | `docs/SET-02-be1-access` (planned) | Pending |
| BE2 | Pending | `docs/SET-02-be2-access` (planned) | Pending |

Local preparation on 22 October 2026: the existing `Team-8` checkout has origin `https://github.com/AI-Ocean-UXMM-2026/Team-8.git`; local task branch `docs/SET-02-team-access` was created. It is not assigned to a teammate and does not prove remote write access. Existing SET-03 edits were preserved.

Complete SET-02 only after all four roles have independent clones, separate task branches and recorded successful pushes/PRs. Until then, keep its checklist box unchecked. This setup changes documentation and local Git state only; backend code and shared staging databases are untouched.
