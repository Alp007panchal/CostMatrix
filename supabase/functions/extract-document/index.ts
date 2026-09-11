// Reads the text out of a document so the assistant can use it later.
//
// Runs on Supabase rather than in the browser for two reasons: the file is
// downloaded with the service role key (the browser only ever gets a short-lived
// link), and a 40-page PDF is not something to parse on a phone. The browser
// asks for it right after an upload; the row says when it is done.
//
// Nothing here decides anything. It fills `documents.extracted_text` and sets
// `extraction_status` to done, unsupported or failed, with the reason. An
// unreadable file is a status, never a crash.
//
// Deploy with:  supabase functions deploy extract-document

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'npm:unpdf'
import { strFromU8, unzipSync } from 'npm:fflate'

// AI spec §4: larger documents are truncated with a warning, never refused.
const MAX_PAGES = 40
const MAX_CHARS = 1_500_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

type Outcome =
  | { status: 'done'; text: string; note?: string }
  | { status: 'unsupported'; reason: string }

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Use POST' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return reply({ error: 'The function is missing its environment variables' }, 500)
  }

  // --- who is asking, and may they see this document? ----------------------
  // The document is looked up with the caller's own token, so row-level
  // security answers the question exactly as it would for the screen. Only then
  // is the privileged client used, for the file and the write-back.
  const authorization = request.headers.get('Authorization')
  if (!authorization) return reply({ error: 'Not signed in' }, 401)

  let documentId: string | undefined
  try {
    documentId = ((await request.json()) as { document_id?: string }).document_id
  } catch {
    return reply({ error: 'Send JSON with a document_id' }, 400)
  }
  if (!documentId) return reply({ error: 'document_id is required' }, 400)

  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: doc, error: lookupError } = await asCaller
    .from('documents')
    .select('id, path, file_name, mime_type, size_bytes')
    .eq('id', documentId)
    .maybeSingle()
  if (lookupError) return reply({ error: lookupError.message }, 500)
  if (!doc) return reply({ error: 'No such document' }, 404)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // --- read it ---------------------------------------------------------------
  let outcome: Outcome
  try {
    const { data: file, error: downloadError } = await admin.storage.from('attachments').download(doc.path)
    if (downloadError || !file) throw new Error(downloadError?.message ?? 'could not download the file')
    const bytes = new Uint8Array(await file.arrayBuffer())
    outcome = await extract(bytes, doc.mime_type ?? '', doc.file_name)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await admin.from('documents').update({
      extraction_status: 'failed', extraction_error: message.slice(0, 2000), extracted_at: new Date().toISOString(),
    }).eq('id', doc.id)
    return reply({ status: 'failed', error: message }, 200)
  }

  if (outcome.status === 'unsupported') {
    await admin.from('documents').update({
      extraction_status: 'unsupported', extraction_error: outcome.reason, extracted_at: new Date().toISOString(),
    }).eq('id', doc.id)
    return reply({ status: 'unsupported', reason: outcome.reason }, 200)
  }

  let text = outcome.text
  let note = outcome.note
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS)
    note = [note, `truncated to ${MAX_CHARS.toLocaleString()} characters`].filter(Boolean).join('; ')
  }
  const { error: saveError } = await admin.from('documents').update({
    extracted_text: text, extraction_status: 'done', extraction_error: note ?? null,
    extracted_at: new Date().toISOString(),
  }).eq('id', doc.id)
  if (saveError) return reply({ error: saveError.message }, 500)

  return reply({ status: 'done', characters: text.length, note: note ?? null }, 200)
})

// --- one extractor per kind of file -------------------------------------------

async function extract(bytes: Uint8Array, mime: string, fileName: string): Promise<Outcome> {
  const name = fileName.toLowerCase()
  const is = (...ends: string[]) => ends.some((e) => name.endsWith(e))

  if (mime.startsWith('text/') || is('.txt', '.csv', '.md')) {
    return { status: 'done', text: new TextDecoder('utf-8', { fatal: false }).decode(bytes) }
  }
  if (mime === 'application/pdf' || is('.pdf')) return await fromPdf(bytes)
  if (mime.includes('wordprocessingml') || is('.docx')) return fromDocx(bytes)
  if (mime.includes('spreadsheetml') || is('.xlsx')) return fromXlsx(bytes)

  return { status: 'unsupported', reason: `Only PDF, Word (.docx), Excel (.xlsx) and plain text are read; this is ${mime || name}` }
}

async function fromPdf(bytes: Uint8Array): Promise<Outcome> {
  const pdf = await getDocumentProxy(bytes)
  const { totalPages, text } = await extractText(pdf, { mergePages: false })
  const pages = (text as string[]).slice(0, MAX_PAGES)
  const joined = pages.map((t, i) => `--- page ${i + 1} ---\n${t.trim()}`).join('\n\n')
  const note = totalPages > MAX_PAGES ? `first ${MAX_PAGES} of ${totalPages} pages read` : undefined
  return note ? { status: 'done', text: joined, note } : { status: 'done', text: joined }
}

// A .docx is a zip; the words are in word/document.xml. Paragraph ends become
// line breaks and every other tag is dropped.
function fromDocx(bytes: Uint8Array): Outcome {
  const files = unzipSync(bytes)
  const xml = files['word/document.xml']
  if (!xml) return { status: 'unsupported', reason: 'not a Word document: word/document.xml is missing' }
  const text = strFromU8(xml)
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
  return { status: 'done', text: decodeEntities(text) }
}

// An .xlsx is a zip too: cell text lives in xl/sharedStrings.xml and each sheet
// refers to it by index. Cells are joined by tabs, rows by line breaks, sheets
// by a heading, which is enough for the assistant to read a tender schedule.
function fromXlsx(bytes: Uint8Array): Outcome {
  const files = unzipSync(bytes)
  const sharedXml = files['xl/sharedStrings.xml']
  const shared: string[] = sharedXml
    ? [...strFromU8(sharedXml).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decodeEntities(m[1].replace(/<[^>]+>/g, '')))
    : []

  const sheetNames = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()
  if (sheetNames.length === 0) return { status: 'unsupported', reason: 'not an Excel workbook: no worksheets found' }

  const out: string[] = []
  for (const sheet of sheetNames) {
    out.push(`--- ${sheet.replace('xl/worksheets/', '').replace('.xml', '')} ---`)
    const xml = strFromU8(files[sheet])
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const cell of row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[1]
        const inner = cell[2]
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ''
        if (/t="s"/.test(attrs)) cells.push(shared[Number(v)] ?? '')
        else if (/t="inlineStr"/.test(attrs)) cells.push(decodeEntities(inner.replace(/<[^>]+>/g, '')))
        else cells.push(v)
      }
      if (cells.some((c) => c.trim() !== '')) out.push(cells.join('\t'))
    }
  }
  return { status: 'done', text: out.join('\n') }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}
