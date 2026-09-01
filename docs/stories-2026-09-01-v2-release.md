# SREDA Stories — 1 September 2026 V2 release

Status: `FOR_REVIEW_DO_NOT_PUBLISH`

Target: `@sreda.astana`

Authorization scope: none. A newer user instruction stopped publication and requires explicit design approval after reviewing a single calendar preview.

Encrypted package: `content/stories-2026-09-01-v2.tar.gz.enc`, SHA-256 `DA8F52CF7C7D4C2BD53E41813A9D02E421F05ABF59AFF2091ED0B12F6611B3FF`.

## Exact ordered slots

| Local slot | Encrypted asset path | SHA-256 of approved plaintext |
|---:|---|---|
| 15:20 | `2026-09-01-v2/01-information-guest.png` | `997B387C3DF3D9A951F3D1FFBD4CE4A31558021DD3F882DAC3BDAC0A553BC80B` |
| 15:40 | `2026-09-01-v2/02-air-balloons.png` | `76D6E04E93730592A32D25BD9FD41B286114F310EC13908880F6D0A7F26EC7FB` |
| 16:00 | `2026-09-01-v2/03-live-editorial.png` | `DFC7D5FBB38670872A125321AE14DE1F9DDE493278084E8BB7E0CA07516BE07C` |
| 16:20 | `2026-09-01-v2/04-air-ivory.png` | `9D0BACA16A64EAB419D951EC127F9090109EC3B4B19B6F9658B78190DA632402` |
| 16:40 | `2026-09-01-v2/05-information-omelette.png` | `B29199B3177E26BD77A82841FEC1924CF5CF6D52263479448FA54EC0932639C0` |

## Safety boundary

- Workflow dispatch only; no recurring Story cron.
- Twenty-minute spacing keeps the five `slot…slot+15m` publication windows non-overlapping, preserving order even when Meta latency varies.
- Local date must equal `2026-09-01`.
- Every slot refuses publication after `+15 minutes`.
- Account guard requires Meta `user_id` and username `sreda.astana` to match before container creation.
- Each frame uses a separate durable ledger key and pre-POST reservation.
- After all five Meta publication IDs are confirmed, the Story workflow is disabled again.
