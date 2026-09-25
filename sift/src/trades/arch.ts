import type { TradeRules } from "./types";

/**
 * Meridian Architects. The criteria are written from the class boundaries in `fixtures/README.md`:
 * the class table and the labelling notes committed before any run was scored. They state the same
 * boundaries the labeller used, so the boundary the model is asked about is the boundary it is scored
 * against. Nothing here was added from a run's results.
 */
export const ARCH: TradeRules = {
  topics: {
    rfi: {
      owner: { to: "slot", slot: "coordinator" }, noun: "An RFI",
      criteria: {
        true: "A question about the drawings or specifications that construction is waiting on, numbered or not, whoever passes it along. Correspondence about an RFI, including closing one out, counts.",
        false: "A request to approve product data, samples or shop drawings is a submittal, even when titled RFI. A client asking how the project is going is a status request.",
      },
    },
    submittal: {
      owner: { to: "slot", slot: "reviewer" }, noun: "A submittal",
      criteria: {
        true: "Product data, samples, shop drawings, mix designs or cut sheets sent for review or approval, including resubmittals, reminders about a pending review, and confirmations of one already reviewed.",
        false: "A question about what the drawings mean is an RFI. A bill for samples is an invoice.",
      },
    },
    agency_letter: {
      owner: { to: "owner" }, noun: "A regulatory letter",
      criteria: {
        true: "A letter or automated notice from a city, county, state or other public authority about a permit, plan review, inspection, hearing, licence or compliance, including one forwarded by someone else.",
        false: "A vendor, directory or trade association writing in official-sounding language is not an authority. The firm's own staff discussing an agency matter is internal mail.",
      },
    },
    invoice: {
      owner: { to: "person", name: "Dana Whitfield" }, noun: "A bill",
      criteria: {
        true: "A bill or statement asking the firm to pay for work or goods it bought, including subscription charges.",
        false: "A solicitation dressed as an invoice, which says it is not a bill, is a vendor pitch.",
      },
    },
    client_status: {
      owner: { to: "slot", slot: "lead" }, noun: "The client asking for status",
      criteria: {
        true: "A client asking about progress, schedule or an outstanding item on their project, whether it is the first ask or a repeat.",
        false: "A client relaying a contractor's technical question carries an RFI; a client forwarding an authority's letter carries an agency letter. A question from the contractor is not a client asking for status.",
      },
    },
    other: {
      owner: { to: "ask" }, noun: "Something outside the usual kinds",
      criteria: {
        true: "Actionable mail that none of these kinds holds: an RFI, a submittal, an authority's letter, an invoice, a client asking for status, a vendor pitch or internal mail. For example insurance, legal, press, employment or new-business requests.",
        false: "If any one of those seven kinds fits the message, this is no, even when the message also seems unusual.",
      },
    },
    vendor_pitch: {
      owner: { to: "none" }, noun: "Vendor marketing",
      criteria: {
        true: "Unsolicited marketing, however urgent or official it sounds: offers, trials, demos, directory listings, recruiting and event invitations from vendors.",
        false: "A bill for something the firm actually bought is an invoice. Mail from the firm's clients, contractors, consultants or authorities is not a pitch.",
      },
    },
    internal: {
      owner: { to: "none" }, noun: "Team mail",
      criteria: {
        true: "Mail between the firm's own staff, including forwards and assignments among them.",
        false: "Anything sent from outside the firm.",
      },
    },
  },
  low: ["vendor_pitch", "internal"],
  datesAreNotClocks: ["vendor_pitch", "internal", "invoice"],
  datedFloorHigh: ["agency_letter"],
  unloggedHigh: ["rfi"],
  repeatHigh: ["client_status"],
  knownGaps: ["m076", "m077"],
};
