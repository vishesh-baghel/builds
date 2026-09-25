import type { TradeRules } from "./types";

/**
 * Fieldstone Talent. The criteria are written from the class boundaries in `fixtures/rec/README.md`,
 * committed before any run was scored. A requisition is the work unit: its recruiter (`lead`) owns
 * the candidates and the offer, its account owner (`reviewer`) owns the client relationship, and the
 * coordinator handles every interview and every start by name. Nothing here was added from a run's
 * results.
 */
export const REC: TradeRules = {
  topics: {
    offer: {
      owner: { to: "slot", slot: "lead" }, noun: "An offer matter",
      criteria: {
        true: "About a job offer: extending one, its terms, a counteroffer (including a candidate's current employer trying to keep them), a competing offer, acceptance, decline, expiry or a request for more time. Closing out an offer already decided still counts.",
        false: "A candidate withdrawing before any offer exists is candidate mail only. Start dates and paperwork after acceptance are onboarding. A vendor webinar or promotion that uses the word offer is a pitch.",
      },
    },
    candidate: {
      owner: { to: "slot", slot: "lead" }, noun: "A candidate message",
      criteria: {
        true: "Sent by a candidate, or someone applying to be one, about their own candidacy: availability, questions, notice periods, withdrawing, chasing feedback, or replies on an offer, an interview or their start. It is yes whenever the candidate is the sender, alongside any other kind that also fits.",
        false: "Mail about a candidate from a client, a screening vendor or the firm's own staff is not from a candidate, even when it quotes one. A sourcing tool offering profiles is a pitch.",
      },
    },
    client: {
      owner: { to: "slot", slot: "reviewer" }, noun: "A client message",
      criteria: {
        true: "A client's hiring manager, talent partner or HR team writing about their searches: interview feedback, new requisitions, shortlist chases, offer approvals, fee terms, or a candidate question passed along, first ask or repeat.",
        false: "A client's accounts payable team writing only about an invoice is billing. Client HR writing only about a placed hire's start or paperwork is onboarding. An automated calendar notice is scheduling only.",
      },
    },
    scheduling: {
      owner: { to: "person", name: "Ben Osei" }, noun: "Interview scheduling",
      criteria: {
        true: "Arranging, moving, confirming, holding or cancelling an interview, screen, panel or onsite, from anyone, including automated calendar notices.",
        false: "A start date or first-day logistics is onboarding. The firm's own internal meetings are internal mail. A kickoff call for a new requisition is client mail.",
      },
    },
    onboarding: {
      owner: { to: "person", name: "Ben Osei" }, noun: "An onboarding matter",
      criteria: {
        true: "After an offer is accepted and before or around the start: start dates, background check orders and consent, drug screens, I-9 and payroll paperwork, first-day logistics, including automated notices from a screening vendor.",
        false: "An offer not yet accepted is an offer matter. A screening vendor selling its service is a pitch; its bill is billing.",
      },
    },
    billing: {
      owner: { to: "person", name: "Chloe Grant" }, noun: "A fee or invoice matter",
      criteria: {
        true: "Placement fee invoices, fee disputes, fee terms, remittances, guarantee period claims and refunds or replacements under them, and bills from vendors the firm actually buys from.",
        false: "A solicitation dressed as an invoice, which says it is not a bill, is a pitch. Accounts staff writing among the firm's own team is internal mail.",
      },
    },
    noise: {
      owner: { to: "none" }, noun: "Vendor marketing",
      criteria: {
        true: "Unsolicited marketing, however urgent or official it sounds: job boards, sourcing and assessment tools, screening vendors selling, events, webinars, directory listings, other agencies proposing splits, and recruiting of the firm's staff.",
        false: "A bill or notice about something the firm actually uses is billing or onboarding. Mail from clients, candidates and the firm's own staff is never a pitch.",
      },
    },
    internal: {
      owner: { to: "none" }, noun: "Team mail",
      criteria: {
        true: "Mail between Fieldstone's own staff, including forwards and hand-offs among them.",
        false: "Anything sent from outside the firm.",
      },
    },
  },
  low: ["noise", "internal"],
  datesAreNotClocks: ["noise", "internal", "billing"],
  datedFloorHigh: ["offer", "onboarding"],
  unloggedHigh: ["offer"],
  repeatHigh: ["client", "candidate"],
  knownGaps: ["r033", "r034"],
};
