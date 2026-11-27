# Mobile image separation — experimental foundation

Status: not wired into production; no migration, no release. V1.0.206 downloads the full snapshot but the phone in the reported video reloads during verification before restoration.

This prototype streams canonical UTF-8 JSON into ordered text and original image-token segments. A sink can store the tokens separately; reconstruction streams one segment at a time. No resizing, no deletion, no write to Drive. The local Node test suite checks byte-identical SHA-256 round trips on synthetic data, including 179 repeated synthetic image fields (187704518 bytes), Thai/Unicode, escapes, truncation within a string and missing segment detection. This is not an iPhone performance test or a full JSON validator. The test uses a memory map for the sink, not a persistent mobile database.

Before integration:
- Implement account-scoped transactional staging with persistent segment storage and cleanup, verify canonical snapshot hash and validate full structure before activation.
- Maintain a lightweight project index and lazy image references; load originals on demand. No change to the original backup, existing users or account permissions.
- Adapt editor, persistence, report export PDF/Word/Excel, backup/export, share and two-way sync to preserve exact originals without materializing the entire workspace in memory.
- Preserve conflict handling and old versions; test interrupted imports, storage quotas, two-way edits, report equivalence and account isolation.
- Test on actual iPhone with large backups before deployment; update Thai/English buyer guide and release notes only when integrated.

Run: node --test src/utils/driveImageSegments.test.mjs
