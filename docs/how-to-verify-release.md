# How To Verify Release Artifacts

This document explains how to verify release integrity for public beta artifacts.

## 1) Download artifacts

From the GitHub Release page, download:
- platform artifacts (`desktop-*.tar.gz`, Android APK, iOS IPA/xcframework zip)
- `SHA256SUMS.txt`
- `sbom.cdx.json`

## 2) Verify SHA256 checksums

From the directory containing artifacts:

```bash
sha256sum --check SHA256SUMS.txt
```

Expected output:
- each artifact line reports `OK`
- command exits `0`

If any checksum fails, do not deploy or distribute that artifact.

Optional automation helper:

```bash
bash scripts/verify-release-artifacts.sh dist
```

## 3) Understand the SBOM

`sbom.cdx.json` is a CycloneDX Software Bill of Materials for the Rust workspace in the release build pipeline.

Use it to:
- review included components and versions
- support security triage and vulnerability matching
- keep an auditable dependency snapshot per release

## 4) Minimal operator checklist

1. Verify all downloaded artifact hashes against `SHA256SUMS.txt`.
2. Archive `SHA256SUMS.txt` and `sbom.cdx.json` with deployment records.
3. Promote artifacts only after checksum verification succeeds.
