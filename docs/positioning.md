# Positioning

Animus Link is a relay-first secure overlay for connecting services across NATs and untrusted networks with end-to-end encryption, invite-first onboarding, and operator-grade controls. It is built on Animus Fabric, the underlying protocol/runtime layer that provides secure session framing, relay control/data wire handling, replay protection, and conformance-tested security behavior.

## Animus Link vs Animus Fabric

- Animus Fabric:
  - protocol and systems core (`fabric-*` crates)
  - secure session, wire format, relay protocol, state machine, crypto primitives
- Animus Link:
  - product/operator surface (`link-daemon`, mobile hosts, runbooks, CI/release)
  - local API for status, invite create/join, Expose/Connect
  - managed relay operations and policy controls

## How It Works

1. Invite-first discovery: users create/join namespace invites.
2. Relay-first path: clients establish sessions through managed relay by default.
3. Signed relay tokens: relay accepts signed allocation tokens and enforces TTL/quota controls.
4. L4 service model: `Expose` publishes a service endpoint, `Connect` opens a stream/path to it.
5. End-to-end protection: relay forwards opaque encrypted frames and never decrypts payload.

## What We Monetize

- Managed relay reliability and operations:
  - uptime/SRE, observability, abuse controls, quota policy, key rotation workflows
- Operational controls:
  - signed-token enforcement, tenant/subject limits, metrics and diagnostics
- Future expansion:
  - teams, policy management, and higher-level access governance

## What It Is Not (Public Beta)

- Not a full-device full-tunnel TUN VPN product.
- Not always-on iOS background connectivity in beta (mobile is foreground-only).
- Not a public DHT-style open discovery network.

## Concrete Use Cases

1. Dev access:
  - expose a private dev service and connect securely from laptop/mobile host app.
2. Home-lab access:
  - publish selected internal services without opening inbound router ports broadly.
3. Small team internal tools:
  - relay-first secure access to staging/admin services with signed-token policy gates.
