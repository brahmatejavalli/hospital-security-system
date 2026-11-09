# Security model & deployment checklist

MedGuard is a functional reference application for securing hospital record workflows. **It is not a regulatory compliance certification, a clinical decision system, an endpoint antivirus, or a physical/network surveillance platform.** A production organization must review the entire deployment and its processes before storing real patient data.

## Implemented safeguards

### Accounts & authorization

- PBKDF2-HMAC-SHA256 password hashes with 600,000 iterations and a separate random salt for each password; no plaintext passwords are stored.
- Passwords require 12–128 characters, a letter, and a number. Password whitespace is preserved. Account creation is administrator-only.
- HS256 JWTs require an issuer, audience, subject, issue time, expiry, and account token version. A current, active database account is checked on every authenticated API request.
- Browser sessions use HttpOnly, SameSite=Lax cookies. `Secure` is enforced in production. The React client does not persist bearer tokens in localStorage or sessionStorage.
- Role/access changes, deactivation, administrator password resets, password changes, and sign-out revoke earlier sessions through account token versioning. Sign-out revokes **all** sessions for that account.
- Cross-site mutations are rejected. Non-browser clients must send `X-Requested-With: MedGuard`; the frontend sends it automatically. There is no broad CORS allowlist.
- Production hostnames are allowlisted with `TRUSTED_HOSTS`.
- Login attempts are limited to ten per source IP per 15-minute window; five failed attempts create a high-priority alert. A successful standard login clears that source’s window. Development demo entry has a separate 60-attempt window.
- Four server-enforced roles. Nurses cannot upload/download Restricted records. Auditors can read metadata and security history, but never download file contents. Only administrators can manage staff, delete records, resolve alerts, or change workspace settings.
- An administrator cannot deactivate themselves or change their own role through staff management. Do not treat the UI as the security boundary: the API enforces these rules.

### Files

- File contents are encrypted using **AES-256-GCM**, with a fresh random 12-byte nonce for each file. The record UUID is additional authenticated data, preventing a ciphertext from being substituted under another record ID.
- Encrypted envelopes use a versioned `MG01` prefix, nonce, ciphertext, and GCM tag. Neither local objects nor S3 objects contain plaintext file contents.
- Every content download verifies both the GCM authentication tag and the **SHA3-256 plaintext checksum**. A failed check blocks the download, marks the record for review, and creates a high-priority alert.
- Local objects use UUID-based server-generated paths and private file permissions, never paths derived from client filenames. Path traversal characters are removed from display filenames.
- Requests are bounded before multipart parsing, including chunked bodies. A 10 MB file limit is enforced. Bounded multipart uploads remain in memory until encryption instead of spilling plaintext to the default temporary-file directory.
- Allowed extensions are PDF, PNG, JPEG, UTF-8 CSV, and UTF-8 text. Image/PDF signatures and text encoding are checked against the extension. **These are basic format checks, not deep parsing or malware scanning.**
- Downloads use attachment disposition, `nosniff`, and authenticated API routes. S3 objects are private and never returned as public URLs; uploads request S3 server-side encryption in addition to application encryption.

### Audit & alerts

- Sign-ins, sign-outs, record detail retrievals, content uploads/downloads/deletions, denied role actions, permission changes, member creation, password changes/resets, workspace settings, alert resolutions, and exports produce database audit events.
- Record-list/search requests and frontend-only clicks are not separate audit events. A detail view served from the client cache does not create a new server retrieval.
- Application APIs cannot modify or delete audit events. This is **not cryptographic tamper evidence**: a privileged database operator can still change them. Forward audit events to protected external storage in production.
- CSV fields are quoted and prefixed where needed to prevent spreadsheet formula injection. Audit exports are capped at 10,000 matching rows.
- Live alert rules cover repeated failed sign-ins, blocked content downloads, and failed integrity verification. Historical after-hours/anomaly examples are explicitly synthetic; there is no background anomaly-detection service.
- The posture score is a simple heuristic: 100 minus 4 per open high alert, 2 per medium, 1 per low, and 10 per integrity-review record, floored at zero. It is **not an independent security assessment**.

## Important boundaries

1. **Metadata is not application-encrypted.** Names, emails, filenames, patient reference IDs, classifications, audit events, checksums, and other database fields require database/disk encryption and strict database access controls. File encryption does not replace these safeguards.
2. **This is server-side encryption, not end-to-end encryption.** The API holds the key and decrypts authorized downloads in memory. A compromised application account/host can expose data according to its privileges.
3. **Protect and back up the key.** Development keys are generated once in the ignored private data directory. Production keys must be provided explicitly. Losing or replacing the encryption key makes existing file contents unreadable. Key rotation requires a reviewed re-encryption migration; there is no in-app rotation workflow.
4. **Demo access is deliberately privileged.** Use it only with synthetic data in a disposable development environment. Production mode refuses `DEMO_MODE=true`. Never expose a demo containing real hospital data, and do not reuse a demo database for production.
5. **Deletion is not a legal-retention policy.** The application removes the current object and metadata while retaining the audit event. Backups, S3 versions, replication, and legal retention may preserve prior copies. Define the organizational policy before enabling real deletion.
6. **Cross-service writes are not a distributed transaction.** Failed uploads compensate by removing orphaned ciphertext. A process crash or database/storage outage can still leave orphaned/missing objects. Production operations need backups, reconciliation, and recovery procedures.
7. **Rate limiting is in-process.** For multiple workers/instances use a shared gateway/store. The launcher does not trust forwarded headers. Behind a reverse proxy, explicitly configure trusted proxy IPs in Uvicorn and enforce IP-aware throttling at that proxy. Never trust arbitrary `X-Forwarded-For` headers.
8. **No MFA/SSO or email delivery is configured.** Administrators provision accounts and can reset real member passwords. Users can change their own passwords. Initial/reset passwords must be shared through an approved secure channel; no invitation or recovery email is sent.
9. **Use a migration plan.** `create_all` initializes a fresh v1 database; it is not a migration engine for pre-existing schemas. Review schema upgrades, storage-provider changes, and key changes before applying them.

## Before using real patient information

- [ ] Disable demo mode and provision named administrator accounts with strong passwords.
- [ ] Use HTTPS throughout the public path; verify Secure cookies and trusted host/proxy configuration.
- [ ] Use a secrets manager/KMS and an approved encryption-key recovery procedure; validate encrypted backups with a restore drill.
- [ ] Encrypt database volumes and backups, isolate the database, and restrict data-directory access to the service account.
- [ ] Add organizational authentication requirements, such as SSO/MFA, device controls, and session policies.
- [ ] Review least-privilege IAM/S3 policies, block public bucket access, and define versioning, retention, and deletion behavior.
- [ ] Set reverse-proxy body-size, request-timeout, concurrency, and per-IP/account rate limits. Consider upload quarantine and malware scanning.
- [ ] Send audit events and application logs to access-controlled, externally retained monitoring storage.
- [ ] Define staff onboarding/offboarding, password reset, break-glass access, incident response, and periodic access reviews.
- [ ] Choose a supported database and reviewed migration process; test concurrency and backup recovery at your expected workload.
- [ ] Verify dependency updates, application tests, manual accessibility, penetration testing, and privacy/regulatory obligations in the target environment.

## Reporting a vulnerability

Do not post patient data, credentials, keys, or exploit payloads containing sensitive information in a public issue. Contact the repository owner through a private channel, or use GitHub private vulnerability reporting if it is enabled for the repository.
