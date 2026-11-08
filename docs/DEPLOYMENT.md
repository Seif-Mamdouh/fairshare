# Deployment and verification

Live application: https://fairshare-five-chi.vercel.app

Private repository: https://github.com/Seif-Mamdouh/fairshare

Application branch: `feature/expo-agent-expense-sharing`. Main contains only the baseline (`e08a1b2`); no feature merge was performed. The implementation starts at `b0f94b9`; the feature branch also contains deployment documentation and the Vercel proxy-throttling fix.

Vercel project: `fairshare`, in the personal `seif-mamdouhs-projects` workspace. Initial deployment ID: `dpl_6afAyFnVNqqeduT3Kd6gPUSTqcoP`.

Neon project: `fairshare` (`withered-dawn-15620951`), personal Seif organization, production branch `br-sweet-math-bbxsaytn`, AWS US East 1. Created on the free plan. Nine application tables were created successfully. The pooled database URL is a Vercel production secret; local `.env` and `.env.local` are ignored. No credentials are in this document or Git.

Verified November 8, 2026:

- TypeScript check and 15 automated tests passed.
- Expo web production export passed; iOS and Android Hermes bundle exports passed. These exports are not installed-device or app-store binary tests.
- GitHub CI passed: https://github.com/Seif-Mamdouh/fairshare/actions/runs/42529672919
- Browser checks covered login, receipt approval and balance changes, and recording a suggested settlement at a 390px mobile viewport.
- Live homepage and `/api/health` returned HTTP 200; health performs a Neon query.
- Live API verification covered registration, group/member creation, agent context, receipt submission and approval, identical retry, recorded settlement, and final zero balances. Only the account and group created for this test were removed afterward.
- `/openapi.json` is available on the live host.

Deployment uses the Expo web export and Vercel Node API, with Neon PostgreSQL. Native binaries are not hosted by Vercel. Source is pushed to GitHub; automatic Git-triggered deployments have not been configured. Deploy explicitly from the reviewed feature branch with `npx vercel deploy --prod`, and keep production secrets limited to the production environment.

Authentication throttling trusts the single ingress hop only when running on Vercel. Vercel documents that it [overwrites X-Forwarded-For to prevent spoofing](https://vercel.com/docs/headers/request-headers). A regression test checks distinct client buckets on Vercel and ignores forwarded IPs on the local server.
