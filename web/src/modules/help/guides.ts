import type { UserRole } from '../../lib/database.types'

/**
 * One page per role: what you do, the few things you actually do, and where
 * each one is. Written for somebody's first morning, not as a reference —
 * `docs/operations.md` is the reference, and it is a thousand lines aimed at
 * an administrator, which is the wrong thing to hand a costing engineer.
 *
 * The text lives here as data so a test can check every screen named below is
 * a real route, and so the owner's wording changes touch one file.
 */

export type Step = {
  /** The thing to do, in the imperative. */
  action: string
  /** Where it is. A route the app actually has — `guides.test.ts` checks. */
  where: string
  /** What the screen is called in the navigation. */
  screen: string
  /** Optional: the thing people get wrong here. */
  note?: string
}

export type Guide = {
  /** Null is the guide everybody gets, whatever roles they hold. */
  role: UserRole | null
  title: string
  /** One sentence: what this person is for. */
  blurb: string
  steps: Step[]
}

export const GUIDES: Guide[] = [
  {
    role: 'costing_engineer',
    title: 'Costing a job',
    blurb: 'You turn an enquiry into a priced costing and hand it to an approver.',
    steps: [
      {
        action: 'Log the enquiry — who asked, for what, and by when',
        where: '/crm/enquiries',
        screen: 'Enquiries',
        note: 'A costing made from an enquiry keeps them linked, so the quotation lands back on the right job.',
      },
      {
        action: 'Start a costing and add a panel for each board',
        where: '/costings',
        screen: 'Costings',
        note: 'A panel has a quantity: two identical boards are one panel with quantity 2, not two panels.',
      },
      {
        action: 'Build the panel from kits, chosen by rating',
        where: '/costings',
        screen: 'Costings → the panel',
        note: 'A kit brings its own busbar, cable and accessories. Add loose parts and typed lines for whatever no kit covers.',
      },
      {
        action: 'Check the totals, then submit it',
        where: '/costings',
        screen: 'Costings → the costing',
        note: 'Submitting locks it. If it comes back, you get the reason in writing.',
      },
    ],
  },
  {
    role: 'approver',
    title: 'Approving and quoting',
    blurb: 'You decide whether a costing goes out, and you are the only one who can release the quotation.',
    steps: [
      {
        action: 'Read what was submitted, and the history of who changed what',
        where: '/costings',
        screen: 'Costings',
      },
      {
        action: 'Approve it, or return it with a reason',
        where: '/costings',
        screen: 'Costings → the costing',
        note: 'A returned costing goes back to draft and the reason is kept with it. Returning something is not a failure; sending out a wrong price is.',
      },
      {
        action: 'Release the quotation — this is what produces the PDF',
        where: '/quotations',
        screen: 'Quotations',
        note: 'Nothing is released until the PDF is safely stored, so a failed upload releases nothing.',
      },
      {
        action: 'Mark it sent, and decide won or lost when you hear',
        where: '/crm/enquiries',
        screen: 'Enquiries',
        note: 'Won and lost are decided on the enquiry and name the winning quotation, so one job reads as one decision.',
      },
    ],
  },
  {
    role: 'company_admin',
    title: 'Running the company’s side',
    blurb: 'You set what everything costs, who may do what, and how the quotation reads.',
    steps: [
      {
        action: 'Invite your people and give them roles',
        where: '/admin/people',
        screen: 'People',
        note: 'Somebody who leaves is deactivated rather than deleted, because their name is in the history of costings they worked on.',
      },
      {
        action: 'Set the hourly rates, the copper rate and any currency factor of your own',
        where: '/library/rates',
        screen: 'Rates',
        note: 'A costing freezes the rates it was made with. Changing a rate today does not move a costing made yesterday — that is deliberate.',
      },
      {
        action: 'Set the margins, VAT, rounding and the enclosure uplift',
        where: '/admin/company',
        screen: 'Company',
      },
      {
        action: 'Fill in the letterhead, the terms and the signatory',
        where: '/admin/quotation-defaults',
        screen: 'Quotation wording',
        note: 'Do this before the first real quotation, not after.',
      },
      {
        action: 'Keep the library right: parts, kits and the hours each kit takes',
        where: '/library/components',
        screen: 'Components and Kits',
        note: 'A kit with no hours costs its material and nothing for the time. That is the most expensive mistake this app can make quietly.',
      },
    ],
  },
  {
    role: null,
    title: 'Things that look like faults and are not',
    blurb: 'Three answers that save a message, whatever your role.',
    steps: [
      {
        action: 'An old quotation shows old prices — it is meant to',
        where: '/quotations',
        screen: 'Quotations',
        note: 'A costing freezes every price, rate and factor it was made with, so a quotation can always show the figures it was actually sent with.',
      },
      {
        action: 'A colleague who has left is still named in the history',
        where: '/admin/people',
        screen: 'People',
        note: 'They cannot sign in. Removing the name would leave the record of who approved what wrong.',
      },
      {
        action: 'A screen says it hit an error — it has already told the administrator',
        where: '/terms',
        screen: 'What CostMatrix stores',
        note: 'You do not have to report it. Saying what you were doing still helps.',
      },
    ],
  },
]

/** Your own guides first, then the rest, then the one everybody gets. */
export function guidesFor(roles: UserRole[], isMasterAdmin: boolean): Guide[] {
  const mine = (g: Guide) =>
    g.role !== null && (roles.includes(g.role) || (isMasterAdmin && g.role === 'company_admin'))
  const rank = (g: Guide) => (mine(g) ? 0 : g.role === null ? 2 : 1)
  return [...GUIDES].sort((a, b) => rank(a) - rank(b))
}

/** Whether a guide belongs to this person, for the "yours" mark on the screen. */
export function isYours(guide: Guide, roles: UserRole[], isMasterAdmin: boolean): boolean {
  if (guide.role === null) return false
  return roles.includes(guide.role) || (isMasterAdmin && guide.role === 'company_admin')
}
