# Security

This site stores other people's OpenRouter keys, so a security problem is taken seriously.

## Reporting a problem

A problem is reported privately at <https://github.com/supersonicsines/openresearch/security/advisories/new>, never in a public issue or pull request.
The report should say what was found, how it can be reproduced, and what it could lead to. It will be
acknowledged, and the reporter will be told when it has been fixed.

## In scope

- Stored OpenRouter keys: reading them, using them, or spending beyond a donation.
- Sign-in, sessions, `/admin` and takedowns.
- Model output or prompts that run script, escape the sandbox, or stall the server.
- The git repositories served at `/git/`.

## Out of scope

- OpenRouter and GitHub themselves, which should be reported to them.
- Attacks that need the server's `.env` or the machine itself.
- Prompts that are merely offensive. These are reported on the site, and removed from `/admin`.
