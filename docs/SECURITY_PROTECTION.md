# ProElite Security Protection — phase 1

## What is enforced
- Explicit production minification, no production source maps; check newly generated code and tracked files for a limited set of high-confidence credential signatures before deployment. Reports only file names and categories, never credential values. Do not treat a pass as a complete security audit.
- Remove the two imported pre-license HTML prototypes from the source branch and each archived version served by Pages. Existing versions retain their normal entry points and customer-report viewers. Map files are removed from archived published snapshots; the old archive is checked for filenames, not a full content secret scan.
- Do not alter local project data, Google Drive sync, image processing, account storage, native installer distribution or customer report encryption in this phase.

## Exposure remaining
The source repository and previous Git history are public. Deleting a file from main or current Pages is not erasure of past commits, forks or downloaded copies. The public JS bundle is readable and can be reverse engineered even when minified. Existing AI prompts, models and local business logic are still in client code; an authenticated gateway does not make those prompts private. API keys entered by buyers currently reside in their own workspace, not protected by code minification. Public client keys are not credentials that confer admin access.

## Next phases (do not disable production access before validation)
1. Owner creates or authorizes private source repository and connects approved hosting; migrate code, build workflows, deployment secrets, archive strategy. Preserve current domain and OAuth origin, test side by side, plan redirection and rollback. Verify permissions and confirm that only static intended assets are public before closing the old repository. GitHub connector currently cannot change repository visibility/create repositories.
2. Full history/artifact secret review with approved scanner, rotate any confirmed exposed credentials, verify backend access controls and storage policies using representative non-admin and admin accounts. Never move buyer BYOK keys to a server without consent.
3. Move valuable new algorithms and prompts to an authorized server endpoint after private source is established. Keep only public UI, inputs and output schema client-side. Preserve existing offline/manual features; rate limit endpoints atomically and test bypass/parallel requests.
4. Native per-device cryptographic enrollment, server-side authorization, trusted signing and signed updates. Do not rely on browser user-agent checks or embedded WebView alone. Test Google OAuth, account isolation, local data migration, camera and exports on all platforms. No native-only enforcement before verified rollout.
5. Keep customer reports publicly accessible only through their existing authorized links; maintain owner-only installer distribution and revoke compromised sessions/devices. No paid services without owner approval.

No guarantee of preventing reverse engineering. No secrets or signing keys in Git.
