# Releasing

## Prerequisites

- npm account with permission to publish `dsh-vision-link`;
- npm two-factor authentication or a trusted publisher configuration;
- a clean Git working tree and a pushed version tag.

## Checklist

1. Update `CHANGELOG.md`.
2. Set the version with `npm version <patch|minor|major>`.
3. Run `npm ci`.
4. Run `npm run validate`.
5. Inspect `npm pack --dry-run`.
6. Test the packed tarball in a disposable DSH profile.
7. Push the commit and tag.
8. Publish with `npm publish`.
9. Create a release whose notes match the changelog.

Do not publish local screenshots, debug reports, profile settings, credentials, or internal model/provider names. `npm run check:package` enforces the package boundary, while `.gitignore` keeps known local materials outside the repository.
