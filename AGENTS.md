# Project development instructions

## User-facing releases and onboarding
- For every release, review the buyer guided tour in src/components/BuyerTour.tsx against the actual changed controls and workflows. Update affected Thai and English instructions and data-tour anchors in the same change when a user-facing step changes. Do not add obsolete controls to the tour.
- Keep release highlights in src/components/VersionUpdate.tsx in Thai and English, grouped by meaningful user-facing changes. Omit technical-only commits from user-facing history.
- The guide revision is derived from lesson content; do not force buyers to repeat unchanged lessons for technical-only builds. Verify desktop and mobile behavior, account isolation, and build/deployment before declaring a release ready.
