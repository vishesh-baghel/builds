import type { TradeRules } from "./types";

/**
 * Cedar Grove Dental. The criteria are written from the class boundaries in `fixtures/med/README.md`,
 * committed before any run was scored, so the boundary the model is asked about is the boundary the
 * labeller applied. Nothing here was added from a run's results.
 */
export const MED: TradeRules = {
  topics: {
    claim: {
      owner: { to: "person", name: "Carlos Mena" }, noun: "An insurance claim",
      criteria: {
        true: "Mail from or about a dental payer on a specific claim or pre-authorization: an explanation of benefits, a denial, a remittance line, a request for additional information or radiographs, a pre-authorization decision, an overpayment recovery, or a claim status notice. A patient forwarding or describing a payer's letter about their claim also carries it.",
        false: "A patient asking in general what their plan covers, with no claim in view, is a patient question. A payer asking for x-rays to review a claim is a claim, not a records request. A billing service or coder offering to fight denials is a vendor pitch.",
      },
    },
    lab: {
      owner: { to: "slot", slot: "lead" }, noun: "A lab case",
      criteria: {
        true: "A dental lab writing about a case or its service: receipt of a case, a prescription or shade question, a design to approve, a remake, a delay, a shipment, an adjustment, or a change to its pickup and delivery routine.",
        false: "A lab's monthly statement or bill is a supplier invoice. Staff discussing a lab case among themselves is internal mail. A milling or scanner company selling equipment is a vendor pitch.",
      },
    },
    appt: {
      owner: { to: "person", name: "Sofia Duarte" }, noun: "An appointment request",
      criteria: {
        true: "Someone asking to book, move, confirm or cancel a visit, including a new patient asking to be seen and another provider asking the practice to schedule a patient it is referring.",
        false: "A specialist asking for films or charts before their own visit is a records request. A question about care, a bill or coverage that asks for no visit is a patient question.",
      },
    },
    records: {
      owner: { to: "person", name: "Beth Lawson" }, noun: "A records request",
      criteria: {
        true: "A request to release or transfer a patient's records, radiographs or charting: from the patient, their representative, another provider, an insurer underwriting a policy, or an attorney or subpoena, including a chase on one already made and a request for a referral letter.",
        false: "A payer asking for radiographs to adjudicate a claim is a claim. A records retrieval or storage company selling a service is a vendor pitch. A provider asking the practice to see a patient is an appointment request.",
      },
    },
    patient: {
      owner: { to: "person", name: "Beth Lawson" }, noun: "A patient question",
      criteria: {
        true: "A patient, or a family member writing for one, asking about their care, their bill, a refund, a receipt, a payment plan or what their plan covers, or complaining about a visit, first ask or repeat.",
        false: "A request only to book, move or cancel a visit is an appointment request. A request for a copy or transfer of records is a records request.",
      },
    },
    vendor: {
      owner: { to: "person", name: "Beth Lawson" }, noun: "A supplier invoice",
      criteria: {
        true: "A bill, statement, past-due notice or subscription receipt asking the practice to pay for goods or services it actually bought, including a dental lab's monthly statement.",
        false: "A solicitation laid out like an invoice, which says it is not a bill, is a vendor pitch. A lab writing about a case rather than a bill is a lab case.",
      },
    },
    noise: {
      owner: { to: "none" }, noun: "Vendor marketing",
      criteria: {
        true: "Unsolicited marketing, however urgent or official it sounds: offers, trials, demos, directory listings, denial recovery or records retrieval services, recruiting, courses and event invitations.",
        false: "A bill for something the practice bought is a supplier invoice. Mail from its patients, payers, labs, referring providers or the dental board is not a pitch.",
      },
    },
    internal: {
      owner: { to: "none" }, noun: "Team mail",
      criteria: {
        true: "Mail between the practice's own staff, including forwards and assignments among them, and practice housekeeping addressed to the practice as a whole, such as a dental board's broadcast that a licence renewal period is open.",
        false: "Anything a patient, payer, lab, referring provider or supplier sends about a case, a claim, a visit or a bill.",
      },
    },
  },
  low: ["noise", "internal"],
  datesAreNotClocks: ["noise", "internal", "vendor", "appt"],
  datedFloorHigh: ["claim", "records"],
  unloggedHigh: ["records"],
  repeatHigh: ["patient", "lab"],
  knownGaps: ["d010", "d027", "d059"],
};
