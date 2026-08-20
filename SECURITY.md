# Security Policy

## Supported versions

Security fixes are provided for the latest published minor version.

## Reporting a vulnerability

Do not open a public issue for vulnerabilities involving credential exposure, cross-origin access, request routing, or image prompt injection. Use [GitHub private vulnerability reporting](https://github.com/sprainJinyu/dsh-vision-link/security/advisories/new).

Keep the report private and include only the minimum reproduction needed. Never include real API keys, private images, complete `settings.yaml` files, or unrelated logs.

## Security model

- The plugin does not own or persist provider credentials.
- The browser receives a sanitized, loopback-only mapping projection.
- Image content is treated as untrusted input.
- A failed vision extraction stops before the original text model is invoked.

Security behavior depends on the DSH Host and configured model providers. Keep DSH and this plugin current.
