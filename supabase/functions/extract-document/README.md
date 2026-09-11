# extract-document

Reads the text out of a file kept with an enquiry or a costing, and writes it to
`documents.extracted_text`, so the assistant can read the specification without
being handed the PDF itself.

## What it does

1. Checks the caller is signed in, and looks the document up **with the caller's
   own token**, so row-level security decides whether they may see it exactly as
   it would for the screen. Anything they cannot see is "no such document".
2. Downloads the file from the private `attachments` bucket with the service
   role key — the browser only ever gets a short-lived link.
3. Reads it, by type:

   | Kind | How |
   |---|---|
   | PDF | `unpdf`, page by page, the first 40 pages (AI spec §4) |
   | Word `.docx` | unzipped; `word/document.xml` with paragraph ends kept as line breaks |
   | Excel `.xlsx` | unzipped; shared strings resolved, cells joined by tabs, rows by line breaks, one heading per sheet |
   | plain text, CSV, Markdown | decoded as UTF-8 |
   | anything else | marked `unsupported`, with the reason |

4. Writes `extracted_text`, sets `extraction_status` to `done`, `unsupported` or
   `failed`, and records the reason or a truncation note in `extraction_error`.
   Text longer than 1.5 million characters is cut, and the note says so.

An unreadable file is a status on the row, never a crash: the row says
**could not read** with the reason, and the screen offers **retry**.

## Who calls it

The web app, right after an upload (`web/src/modules/documents/api.ts`), fire and
forget: a failure leaves the row at `pending`, which the screen shows as
**waiting** with a **read now** button. A later sweep over `pending` rows is a
natural addition when there is a scheduler.

## Deploying

`supabase functions deploy extract-document`. The "Deploy functions" workflow does
this on every push to `main` (production) or `advanced` (staging) that touches
`supabase/functions/`; **Create staging project** also deploys every function.

The three environment variables it reads — `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — are injected by Supabase into
every Edge Function. Nothing to set.

## Not yet verified

This function has not been run against real files from this build environment,
which has no Deno and no Supabase project. The PDF, Word and Excel paths are
each written to fail into `failed` with the message rather than throw, so the
first real run tells you what happened rather than hiding it.
