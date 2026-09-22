# Security

## Scope

unbuild is a local CLI that accepts a user-supplied HTTP(S) URL and drives Chromium against that destination.

The primary security boundary is therefore the machine and network environment where unbuild runs.

unbuild is **not a sandbox**. Chromium is used to render pages, not to provide a security isolation boundary.

## Threat model

### Network access

A target website controls HTML, CSS, JavaScript, redirects, and resource URLs that the browser may request.

A malicious or compromised target can therefore attempt to:

- reach services on private or loopback networks;
- access cloud metadata endpoints;
- abuse DNS or redirects;
- cause excessive downloads or CPU/memory consumption;
- return attacker-controlled content into the generated output;
- exploit browser or dependency vulnerabilities.

This is an inherent risk of arbitrary web rendering.

### Local filesystem

unbuild writes screenshots, JSON, and Markdown to the output directory selected by the user.

Generated filenames and metadata must be treated as untrusted input. Do not run generated scripts or feed generated instructions to an agent without reviewing the output.

### Credentials

unbuild should not be given cookies, passwords, client certificates, private keys, or authenticated browser profiles.

Do not use a browser profile containing sensitive sessions with this tool.

### Supply chain

The project depends on Node.js, npm, Playwright, Chromium, GitHub Actions, and npm publishing infrastructure.

Release automation is intended to use npm Trusted Publishing/OIDC so that long-lived npm publish tokens are not stored in GitHub Actions.

## Safe usage

For untrusted targets, prefer an isolated environment:

```text
host
  └── container / VM
        └── unbuild
             └── Chromium
                  └── target website
```

Recommended operational controls:

- use a dedicated container or VM;
- use a network policy that prevents access to internal services;
- do not mount sensitive host directories;
- do not pass cloud credentials into the environment;
- do not expose SSH agents or credential sockets;
- keep Node.js, Playwright, and Chromium current;
- write output into a disposable directory;
- inspect generated files before opening or executing them.

## SSRF considerations

A URL parser check alone is not a complete SSRF defense. DNS rebinding, redirects, IPv4/IPv6 representations, and browser subresource requests can defeat simplistic hostname checks.

If unbuild is ever operated as a service rather than a local CLI, the service must introduce a real network isolation boundary. Do not expose the current CLI implementation directly as a public URL-fetching service.

Service deployments should enforce, at minimum:

- an explicit egress policy;
- blocking loopback, link-local, private, multicast, and metadata networks;
- redirect revalidation;
- DNS resolution controls;
- resource and time limits;
- process/container isolation;
- least-privilege filesystem access.

## Out of scope

The following are normally expected behavior rather than vulnerabilities:

| Category | Reason |
| --- | --- |
| The target site is fetched | Fetching the URL is the product's core function. |
| A target site controls its own page content | The browser is intentionally rendering the target. |
| Output contains target-controlled text or URLs | Output is derived from observed page content. |
| A target page requests third-party resources | Browser resource loading is expected behavior. |
| The target site exposes its own public information | unbuild does not bypass access controls. |
| User runs unbuild against an intentionally private test site | The user controls the target and execution environment. |

A report is still appropriate when the behavior crosses the local security boundary, such as unintended access to protected local resources, credential disclosure, arbitrary local file writes, command execution, or a vulnerability in our code/dependencies that can be triggered by a remote page.

## Reporting a vulnerability

Please report security vulnerabilities privately through GitHub's **Report a vulnerability** flow:

https://github.com/SohailKhan0525/unbuild/security/advisories/new

Do not open a public issue for an unpatched security vulnerability.

Include:

- affected version or commit;
- environment and Node.js version;
- exact reproduction steps;
- a minimal proof of concept;
- expected behavior;
- actual behavior;
- impact assessment;
- logs or stack traces that do not contain secrets.

Please give maintainers reasonable time to investigate and release a fix before public disclosure.

If private vulnerability reporting is unavailable, open a minimal issue asking maintainers to enable a private reporting channel; do not disclose exploit details publicly.

## Dependency vulnerabilities

For dependency vulnerabilities, please include the package name, affected version, advisory identifier when available, and why the dependency issue is reachable through unbuild.

Do not submit automated scanner output without validating that it affects this project.

## Disclosure

Confirmed vulnerabilities will be handled through GitHub Security Advisories where appropriate. Release notes may document the affected versions, impact, remediation, and upgrade path.

Security fixes should not include secrets, exploit credentials, or unnecessary weaponized proof-of-concept material.
