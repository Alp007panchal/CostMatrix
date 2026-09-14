/**
 * What CostMatrix stores and who can see it, in plain words.
 *
 * The text lives here as data rather than inside the component so that a test
 * can assert the promises are actually on the page. `docs/architecture.md` §2
 * makes four of them — what is stored, that it is held in Ireland, that no
 * company can see another company's data, and that a company's data is deleted
 * on request — and a page that quietly dropped one would be worse than no page.
 *
 * The wording is the owner's to change. It describes what the app does; it is
 * not a lawyer's document and does not pretend to be one.
 */

export type TermsSection = {
  /** Anchor-friendly id, also what the test looks for. */
  id: string
  heading: string
  paragraphs: string[]
  /** Optional bullet list under the paragraphs. */
  points?: string[]
}

export const TERMS_UPDATED = '13 September 2026'

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'what-this-is',
    heading: 'What this is',
    paragraphs: [
      'CostMatrix is used by a company to cost electrical panel boards and to produce quotations from those costings. This page says what it stores, where that is kept, and who can see it.',
      'You do not create your own account. An administrator at your company invites you, and can remove you.',
    ],
  },
  {
    id: 'what-is-stored',
    heading: 'What is stored',
    paragraphs: ['Two kinds of thing: your company’s work, and enough about you to sign you in and to say who did what.'],
    points: [
      'The company’s library: parts, prices, kits and the hours each kit takes.',
      'Costings and quotations, including the prices and rates as they stood when the costing was made. These are kept as they were on purpose — a quotation has to be able to show the figures it was actually sent with.',
      'Customers, contacts, projects and enquiries entered by the company, and any files attached to an enquiry, such as drawings and specifications.',
      'Your name, your email address, and which roles you hold.',
      'A record of who submitted, approved or changed a costing, and when.',
      'When a screen breaks for somebody: what the error said, which page it happened on, who was signed in and which browser. It can quote a value that caused the failure, so it is kept no longer than ninety days and then deleted automatically.',
    ],
  },
  {
    id: 'where-it-is-kept',
    heading: 'Where it is kept',
    paragraphs: [
      'On Supabase, in their Ireland region (eu-west-1). The web pages are served by Vercel. Files you upload, and the quotation PDFs the app produces, are held in private storage on the same Supabase project and are only reachable through a signed link the app creates for you.',
      'Backups are taken by Supabase, and a weekly copy of the database is taken and kept for ninety days so the data can be restored if something goes wrong.',
    ],
  },
  {
    id: 'who-can-see-it',
    heading: 'Who can see it',
    paragraphs: [
      'No company can see another company’s data. That is enforced by the database itself rather than by the screens: every row belongs to a company, and the rules that decide who may read a row run inside Postgres, on every request, whatever the app asks for.',
      'The administrator who runs CostMatrix can read company data in order to support it, and cannot change it. Prices in the shared master library are visible to every company; what each company pays, what it has costed and what it has quoted are not.',
    ],
  },
  {
    id: 'deleting-it',
    heading: 'Deleting it',
    paragraphs: [
      'A company’s data is deleted on request. Ask your administrator, who will pass the request on.',
      'Somebody who leaves is deactivated rather than erased, because their name appears in the history of costings they worked on and removing it would leave that record wrong. They can no longer sign in.',
    ],
  },
  {
    id: 'asking',
    heading: 'Asking about any of this',
    paragraphs: [
      'Ask your company administrator first — they can see who holds what, and can pass anything else on.',
    ],
  },
]
