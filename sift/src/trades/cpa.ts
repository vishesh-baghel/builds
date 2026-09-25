import type { TradeRules } from "./types";

/**
 * Larkin & Voss CPAs. The criteria are written from the class boundaries in `fixtures/cpa/README.md`:
 * the class table and the labelling notes committed before any run was scored. They state the same
 * boundaries the labeller used, so the boundary the model is asked about is the boundary it is scored
 * against. Nothing here was added from a run's results.
 */
export const CPA: TradeRules = {
  topics: {
    notice: {
      owner: { to: "owner" }, noun: "A tax notice",
      criteria: {
        true: "A notice or letter from the IRS, a state revenue or labor department, or another taxing authority about a client's account, return, balance, penalty, deposit or registration, including one a client forwards, photographs or paraphrases.",
        false: "A software vendor, webinar host or \"tax relief\" firm writing in official-sounding language is not an authority. The firm's own staff discussing a notice is internal mail. A client asking a general tax question with no notice in hand is a client question.",
      },
    },
    docs: {
      owner: { to: "slot", slot: "coordinator" }, noun: "Client documents",
      criteria: {
        true: "A client, or someone acting for one, sending or uploading documents the firm needs: W-2s, 1099s, K-1s, bank and card statements, receipts, organizers, signed forms, including a note that they are on the way or in the portal.",
        false: "A tax authority's notice sent as an attachment is a notice. A vendor attaching a brochure is a pitch. A client asking what documents to send, without sending any, is a client question.",
      },
    },
    question: {
      owner: { to: "slot", slot: "lead" }, noun: "The client asking a tax question",
      criteria: {
        true: "An existing client asking a tax or filing question, or asking where their return, extension or refund stands, first ask or repeat.",
        false: "A question about the firm's own invoice is billing. A question about running payroll or a payroll deposit is payroll. Someone who is not yet a client asking about taxes is a prospective client.",
      },
    },
    payroll: {
      owner: { to: "person", name: "Sofia Blanco" }, noun: "A payroll matter",
      criteria: {
        true: "Anything about running a client's payroll: new hires, terminations, pay changes, payroll tax deposits, quarterly and annual payroll returns, withholding accounts and the payroll provider's notices.",
        false: "A payroll company pitching its service is a vendor pitch. The firm's own staff pay is internal mail.",
      },
    },
    prospect: {
      owner: { to: "person", name: "Owen Hart" }, noun: "A prospective client",
      criteria: {
        true: "Someone who is not yet a client asking whether the firm can take them on, or a referral introducing one.",
        false: "An existing client adding a new service is a client question. Someone selling to the firm is a vendor pitch.",
      },
    },
    billing: {
      owner: { to: "person", name: "Owen Hart" }, noun: "A billing item",
      criteria: {
        true: "About the firm's own invoices and fees: a client querying, disputing, paying or asking for a copy of one, or a payment processor's receipt for one.",
        false: "A client's own vendor bill sent for bookkeeping is client documents. An authority's balance due is a notice. A vendor invoice sent to the firm for something it did not buy is a pitch.",
      },
    },
    noise: {
      owner: { to: "none" }, noun: "Vendor marketing",
      criteria: {
        true: "Unsolicited marketing, however urgent or official it sounds: software offers, trials, CPE and \"IRS update\" webinars from vendors, directory listings, recruiting and lead lists.",
        false: "Mail from an actual tax authority, a client, a prospect or the firm's staff is not a pitch, even when it is short or looks automated.",
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
  low: ["noise", "internal"],
  datesAreNotClocks: ["noise", "internal", "billing", "docs", "prospect"],
  datedFloorHigh: ["notice"],
  unloggedHigh: ["notice"],
  repeatHigh: ["question"],
  knownGaps: ["c049", "c050"],
};
