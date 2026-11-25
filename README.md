# SmartExam

Smart Online Examination System for universities, schools, and employers in Ethiopia. One installation can host exit exams, entrance exams, and job recruitment tests.

The interface is in English, Amharic, and Afaan Oromo. Question text stays in the language you wrote it. Edit the dictionaries in `src/lib/i18n.ts`.

## Demo accounts

These accounts are already verified. Change the passwords before a real deployment.

| Role | Email | Password |
| --- | --- | --- |
| Super admin | admin@smartexam.et | SmartExam#Admin1 |
| Exam manager (Addis Ababa University) | teacher@aau.edu.et | SmartExam#Teach1 |
| Candidate | abel@student.et | SmartExam#Take1 |
| Candidate, Amharic name ሊያ ታደሰ | liya@student.et | SmartExam#Take1 |
| Candidate, Afaan Oromo interface | yonas@student.et | SmartExam#Take1 |

Sample exams:

- **Computer Science Exit Examination** — instant results. Abel can sit it now and see the mark on submit. Webcam snapshots and fullscreen are requested.
- **Undergraduate Entrance Sample** — scheduled release. The window ends 15 December 2026, 18:00 Addis Ababa, and results open 14 days later (29 December 2026, 18:00). Liya and Yonas have already submitted. They do not see marks. Staff do. An exam manager can change the date or choose **Release results now**, which emails the candidates.
- **Junior IT Officer Recruitment Test** — scheduled release whose window already closed (31 October 2026). The default release, 14 days after the end, was 14 November 2026, so those marks are visible and the result emails are in Messages. The essay was marked by hand.

## Result release

Set this per exam in the exam builder.

- **Instant.** The candidate sees the mark as soon as they submit (after any essay is marked).
- **Scheduled release.** After submit, the candidate sees “Submitted. Results will be available on &lt;date&gt;.” The date defaults to **14 days after the exam end**. Change it in the builder, or release early from the exam page. When the date arrives, the mark becomes visible and a result email is queued (or sent, if email is configured). Admins and exam managers always see marks immediately.

An hourly Netlify scheduled function calls `/api/cron/release` so emails go out even if nobody has the site open. Locally, the same check runs when a signed-in person loads the app.

## Accounts and one-time codes

Candidate self-registration asks for email **or** phone. The account is created **inactive** until the 6-digit code is entered. The same code resets a password.

- Codes expire after 10 minutes (`OTP_TTL_MINUTES`).
- Five wrong attempts lock that code (`OTP_MAX_ATTEMPTS`).
- A new code can be requested once a minute, and at most five times an hour for the same destination.
- Phone numbers must be Ethiopian mobiles: `09…`, `07…`, or `+251…`. They are stored as `+2519xxxxxxxx` or `+2517xxxxxxxx`.

Staff-created users are active immediately. The demo accounts above are already verified.

### Dev mode

If a channel has no provider, or `OTP_DELIVERY=dev`, the code is printed in the server console and appended to `data/otp-dev.log`. It is not shown on the page and it is not stored in the message outbox.

Set `OTP_DELIVERY=live` in production so a missing provider fails the send instead of printing the code.

### Email

`EMAIL_PROVIDER=resend` or `smtp`. If unset, Resend is used when `RESEND_API_KEY` is set, otherwise SMTP when `SMTP_HOST` is set.

- Resend: `RESEND_API_KEY`, `RESEND_FROM`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Exam schedule and result emails use the same email path. Without a provider they stay in **Messages** with status `queued`.

### SMS

`SMS_PROVIDER=twilio` or `afromessage`.

- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
- AfroMessage: `AFROMESSAGE_TOKEN`, `AFROMESSAGE_SENDER`, optional `AFROMESSAGE_IDENTIFIER` and `AFROMESSAGE_API_URL` (default `https://api.afromessage.com/api/send`). The app calls that URL with `Authorization: Bearer` and `sender`, `to`, and `message`, which matches AfroMessage’s send API.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:43219. No database server is required. Data lives in `./data/pglite` and is created and seeded on first launch.

To apply the SQL file or load the sample data yourself:

```bash
npm run db:migrate
npm run db:seed
```

`db:seed` inserts the demo institutions only when the users table is empty. To wipe the sample and load it again from the app, sign in as the super admin and use **Restore demo data** on the dashboard.

Production refuses to start without `DATABASE_URL` or `NETLIFY_DB_URL`. The file database does not survive on Netlify or Vercel.

## Environment

Copy `.env.example` to `.env.local`. See that file for every variable.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Links in emails and the QR code on a result slip |
| `DATABASE_URL` or `NETLIFY_DB_URL` | Postgres. Unset uses the local file database |
| `SEED_DEMO` | Seed an empty hosted database. Local files seed when empty |
| `CRON_SECRET` | Bearer token for `/api/cron/release` in production |
| `OTP_*`, `EMAIL_*`, `RESEND_*`, `SMTP_*`, `SMS_*`, `TWILIO_*`, `AFROMESSAGE_*` | Verification codes and mail |
| `OPENAI_API_KEY` or `AI_API_KEY` | One key for every AI-assisted suggestion. Optional |
| `AI_BASE_URL`, `AI_MODEL` | Compatible chat-completions endpoint and model. Defaults to OpenAI `gpt-4o-mini` |

SmartExam is an AI-assisted examination system. Question drafts, marking suggestions, quality checks, translation, student feedback, paper blueprints, and proctor summaries all use that same provider. A person accepts or edits every output before it is used. With no key, marking suggestions, quality notes, feedback, paper lists, and proctor summaries are still drafted from the exam data and labeled as such. Translation stays off and does not change the question. Question drafts are saved with status `draft` and stay out of an exam until a person publishes them. A draft can start from a topic, difficulty, count, and question type, plus pasted text or a PDF. The live sitting page for an exam shows who is online, progress, time left, disconnects, and a risk score built from tab switches, fullscreen exits, a refused camera, paste, and disconnects. Difficulty set by hand stays on the question; after two or more marked answers, SmartExam also records the correct-answer rate and a calibrated easy, medium, or hard label. A student report PDF lists history, topic strengths, and the cohort average for each exam.

Result slips, certificates, and student reports embed [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) and [Noto Sans Ethiopic](https://fonts.google.com/noto/specimen/Noto+Sans+Ethiopic), both under the SIL Open Font License (`assets/fonts/OFL.txt`). Amharic names and labels use the Ethiopic face. Afaan Oromo, which is written in Latin script, uses Noto Sans. Every slip also prints `Result slip · የውጤት ወረቀት · Waraqaa bu'aa`.

## Database (Supabase or any Postgres)

Local `npm run dev` uses a Postgres-compatible file in `./data/pglite` and needs no hosted database.

For a shared deployment:

1. Create a Postgres database. On Supabase: New project, then Project Settings → Database → connection string (URI). Use the direct or pooler URI.
2. Open the SQL editor and run the files in `netlify/database/migrations` in order (`0001_init`, `0002_features`, `0003_ai_assist`). On Netlify Database you do not run them yourself: the deploy applies every folder under `netlify/database/migrations`.
3. Set `DATABASE_URL` to that URI. Supabase usually needs SSL, which the app turns on unless the host is localhost.
4. Set `SEED_DEMO=true` for the first boot so the demo institutions, accounts, and exams are inserted into the empty database. Turn it off after that so a later restart does not depend on it. Seeding only runs when the `users` table is empty.
5. Set `NEXT_PUBLIC_APP_URL` to the public site URL so email links and the QR code on a result slip point at the deployment.

## Deploy on Vercel

1. Import the Git repository. The framework preset is Next.js. Build command `npm run build`.
2. Add the environment variables from `.env.example`: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `SEED_DEMO`, `CRON_SECRET`, and any email or SMS keys.
3. Deploy. `vercel.json` calls `GET /api/cron/release` every hour. Set `CRON_SECRET`. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when that variable exists. Hobby accounts only allow a daily cron; if the deploy rejects the hourly schedule, change `vercel.json` to `"schedule": "0 8 * * *"`. Marks still appear on the next page view after the release time. The cron is what sends the result email.

```bash
npx vercel deploy
npx vercel deploy --prod
```

## Deploy on Netlify

1. Create a site from the repository. `netlify.toml` sets Node 22 and `npm run build`.
2. Either set `DATABASE_URL` to Supabase or another Postgres, or install `@netlify/database` and let Netlify provision Postgres. With Netlify Database, commit the migration under `netlify/database/migrations/` and let the deploy apply it. Do not run that SQL by hand against the hosted database.
3. Set `NEXT_PUBLIC_APP_URL`, `SEED_DEMO=true` for the first boot, `CRON_SECRET`, and the email or SMS variables.
4. `netlify/functions/release-results.ts` runs hourly and calls `/api/cron/release` with the bearer token.

```bash
npx netlify deploy
npx netlify deploy --prod
```

## What the app covers

Roles, institutions, categories, departments and positions, users, groups, a question bank (single and multiple choice, true or false, short answer, fill-in-the-blank, matching, essay, image or audio), CSV and Excel import, manual or per-candidate random papers, a timed attempt with autosave, offline retry, refresh recovery, one active session, tab-switch and fullscreen logging, optional webcam snapshots, auto-marking, manual essay marking, instant or scheduled results, rankings, topic analytics, CSV, Excel, and PDF exports, result slips with a verification code and QR code, an audit log, and trilingual UI.
