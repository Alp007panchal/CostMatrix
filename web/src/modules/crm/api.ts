import { supabase } from '../../lib/supabase'
import type {
  Contact, Customer, Enquiry, EnquiryAttachment, EnquiryStatus, Project, QuotationFollowup,
} from '../../lib/database.types'

/**
 * Customers, their contacts and projects, the enquiries that come from them,
 * and follow-ups on sent quotations. Single-entry master data: typed once,
 * chosen from a list everywhere else.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

// --- customers ---------------------------------------------------------------

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').order('name')
  fail('Could not load customers', error)
  return (data ?? []) as Customer[]
}

export type CustomerInput = Pick<Customer, 'name' | 'address' | 'city' | 'country' | 'tax_pin' | 'notes'>

export async function createCustomer(companyId: string, input: CustomerInput): Promise<Customer> {
  const { data, error } = await supabase.from('customers').insert({ ...input, company_id: companyId }).select().single()
  fail('Could not add the customer', error)
  return data as Customer
}

export async function updateCustomer(id: string, input: Partial<CustomerInput & { is_active: boolean }>): Promise<void> {
  const { error } = await supabase.from('customers').update(input).eq('id', id)
  fail('Could not save the customer', error)
}

// --- contacts and projects --------------------------------------------------

export async function listContacts(customerId?: string): Promise<Contact[]> {
  const q = supabase.from('contacts').select('*').order('is_primary', { ascending: false }).order('name')
  const { data, error } = customerId ? await q.eq('customer_id', customerId) : await q
  fail('Could not load contacts', error)
  return (data ?? []) as Contact[]
}

export type ContactInput = Pick<Contact, 'name' | 'email' | 'phone' | 'job_title' | 'is_primary'>

export async function createContact(companyId: string, customerId: string, input: ContactInput): Promise<void> {
  const { error } = await supabase.from('contacts').insert({ ...input, company_id: companyId, customer_id: customerId })
  fail('Could not add the contact', error)
}

export async function updateContact(id: string, input: Partial<ContactInput & { is_active: boolean }>): Promise<void> {
  const { error } = await supabase.from('contacts').update(input).eq('id', id)
  fail('Could not save the contact', error)
}

export async function listProjects(customerId?: string): Promise<Project[]> {
  const q = supabase.from('projects').select('*').order('name')
  const { data, error } = customerId ? await q.eq('customer_id', customerId) : await q
  fail('Could not load projects', error)
  return (data ?? []) as Project[]
}

export type ProjectInput = Pick<Project, 'name' | 'site_location' | 'notes'>

export async function createProject(companyId: string, customerId: string, input: ProjectInput): Promise<void> {
  const { error } = await supabase.from('projects').insert({ ...input, company_id: companyId, customer_id: customerId })
  fail('Could not add the project', error)
}

// --- enquiries ----------------------------------------------------------------

export async function listEnquiries(): Promise<Enquiry[]> {
  const { data, error } = await supabase.from('enquiries').select('*').order('received_on', { ascending: false })
  fail('Could not load enquiries', error)
  return (data ?? []) as Enquiry[]
}

export async function getEnquiry(id: string): Promise<Enquiry | null> {
  const { data, error } = await supabase.from('enquiries').select('*').eq('id', id).maybeSingle()
  fail('Could not load the enquiry', error)
  return (data as Enquiry | null) ?? null
}

export interface EnquiryInput {
  customer_id: string
  contact_id: string | null
  project_id: string | null
  received_on: string
  title: string
  description: string | null
  source: string | null
}

/** Numbered by the database, EN-YYYY-NNNN. */
export async function createEnquiry(input: EnquiryInput): Promise<Enquiry> {
  const { data, error } = await supabase.rpc('create_enquiry', { input })
  fail('Could not log the enquiry', error)
  return data as Enquiry
}

export async function updateEnquiry(id: string, input: Partial<EnquiryInput & { status: EnquiryStatus; owner_user_id: string | null }>): Promise<void> {
  const { error } = await supabase.from('enquiries').update(input).eq('id', id)
  fail('Could not save the enquiry', error)
}

// --- follow-ups ---------------------------------------------------------------

export async function listFollowups(): Promise<QuotationFollowup[]> {
  const { data, error } = await supabase.from('quotation_followups').select('*').order('due_on')
  fail('Could not load follow-ups', error)
  return (data ?? []) as QuotationFollowup[]
}

export async function createFollowup(companyId: string, quotationId: string, dueOn: string, note: string | null, assignedTo: string | null): Promise<void> {
  const { error } = await supabase.from('quotation_followups').insert({
    company_id: companyId, quotation_id: quotationId, due_on: dueOn, note, assigned_to: assignedTo,
  })
  fail('Could not add the follow-up', error)
}

export async function setFollowupDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('quotation_followups').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id)
  fail('Could not update the follow-up', error)
}

/**
 * Won or lost, decided once for the whole enquiry. Winning names the quotation
 * that won it and takes the other offers off the table; losing needs a reason,
 * which every offer still live takes with it.
 */
export async function decideEnquiry(
  enquiryId: string,
  decision: 'won' | 'lost',
  winningQuotationId: string | null,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('decide_enquiry', {
    target: enquiryId,
    decision,
    winning_quotation: winningQuotationId,
    reason,
  })
  fail('Could not record the decision', error)
}

// --- files kept with an enquiry ----------------------------------------------

export async function listEnquiryAttachments(enquiryId: string): Promise<EnquiryAttachment[]> {
  const { data, error } = await supabase
    .from('enquiry_attachments')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('created_at', { ascending: false })
  fail('Could not load the files', error)
  return (data ?? []) as EnquiryAttachment[]
}

/**
 * The file goes into the private bucket first, under the company's own folder;
 * only then is the record written. If the upload fails nothing is recorded, and
 * if the record fails the file is taken back out, so the two never disagree.
 */
export async function addEnquiryAttachment(
  companyId: string,
  enquiryId: string,
  file: File,
  note: string | null,
): Promise<void> {
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-')
  const path = `${companyId}/${enquiryId}/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  fail('Could not upload the file', uploadError)

  const { error } = await supabase.from('enquiry_attachments').insert({
    enquiry_id: enquiryId,
    company_id: companyId,
    file_name: file.name,
    path,
    mime_type: file.type || null,
    size_bytes: file.size,
    note,
  })
  if (error) {
    await supabase.storage.from('attachments').remove([path])
    fail('Could not record the file', error)
  }
}

/** A link that works for a few minutes, long enough to open or save the file. */
export async function attachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 300)
  fail('Could not open the file', error)
  if (!data) throw new Error('Could not open the file: no link was returned')
  return data.signedUrl
}

/** Removes the record and the file itself; the record goes first. */
export async function removeEnquiryAttachment(id: string, path: string): Promise<void> {
  const { error } = await supabase.from('enquiry_attachments').delete().eq('id', id)
  fail('Could not remove the file', error)
  await supabase.storage.from('attachments').remove([path])
}
