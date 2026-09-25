import type { TradeRules } from "./types";

/**
 * Brightwater Builders, a general contractor. The criteria are written from the class boundaries in
 * `fixtures/gc/README.md`, committed before any run was scored. On a project row the coordinator is
 * the superintendent, the lead is the project manager (the estimator on a job still being bid), and
 * the reviewer signs off pricing; no class routes to the reviewer in this version.
 */
export const GC: TradeRules = {
  topics: {
    co: {
      owner: { to: "slot", slot: "lead" }, noun: "A change order",
      criteria: {
        true: "A change to a signed job's scope, price or time: an owner's request for pricing on added or deleted work, a change order or change directive sent for pricing, approval or signature, a subcontractor's own change request, or a note about one already in the change-order register, pending or executed.",
        false: "Pricing on a project the firm is still bidding is a bid item. An owner asking about progress or a pay application with no change in scope is owner correspondence. A subcontractor's bill for contract work is an invoice.",
      },
    },
    bid: {
      owner: { to: "person", name: "Ken Ito" }, noun: "A bid item",
      criteria: {
        true: "Work on a project the firm is pursuing and has not been awarded: an invitation to bid, an addendum, a planholder or pre-bid notice, a bid date or question deadline, a subcontractor's or supplier's quote for the bid, or a prospective owner's question about the bid.",
        false: "Pricing a change on a job already under contract is a change order. A service that sells bid leads or lists bid opportunities for a fee is a vendor pitch, even when it names a real project.",
      },
    },
    inspection: {
      owner: { to: "slot", slot: "coordinator" }, noun: "An inspection matter",
      criteria: {
        true: "A notice from a building department, fire marshal, safety regulator or special inspector about an inspection or site compliance: scheduling, readiness, a pass, a failure or correction list with a reinspection window, a violation or a safety complaint, including one a project owner forwards.",
        false: "A lender's draw inspector works for the owner, so that is owner correspondence. A vendor selling inspection or safety services is a pitch. The firm's own staff forwarding or discussing an inspection is internal mail.",
      },
    },
    sub: {
      owner: { to: "slot", slot: "lead" }, noun: "Subcontractor correspondence",
      criteria: {
        true: "A subcontractor or supplier on an awarded job writing about that work: crew and delivery scheduling, delays, preliminary lien notices and notices of intent to lien, insurance certificates, lien waivers, backcharges, price holds, or asking why it has not been paid.",
        false: "A subcontractor's quote on a project being bid is a bid item, its change request is a change order, and its bill or pay application is an invoice. A supplier's promotion or event is a pitch.",
      },
    },
    owner: {
      owner: { to: "slot", slot: "lead" }, noun: "The project owner",
      criteria: {
        true: "The owner of an awarded job, or its representative or lender's inspector, writing about the job: progress, schedule, photos, pay application questions, retainage, punch lists, complaints and notices to cure, first ask or repeat.",
        false: "An owner's request for pricing or approval of a change is a change order. An owner forwarding a building department's notice carries an inspection matter. A prospective owner on a project still being bid is a bid item.",
      },
    },
    invoice: {
      owner: { to: "person", name: "Laura Bell" }, noun: "A supplier invoice",
      criteria: {
        true: "A bill, statement, credit memo or past-due notice asking the firm to pay for goods, rentals, services or subcontract work it bought, including a subcontractor's monthly pay application and a subscription renewal.",
        false: "A subcontractor asking why it has not been paid is subcontractor correspondence. A solicitation dressed as an invoice, which says it is not a bill, is a vendor pitch.",
      },
    },
    noise: {
      owner: { to: "none" }, noun: "Vendor marketing",
      criteria: {
        true: "Unsolicited marketing, however urgent or official it sounds: software, equipment and material offers, bid-lead services, directory and award listings, compliance services, recruiting and event invitations, including a promotion from a supplier the firm already uses.",
        false: "A bill for something the firm actually bought is an invoice. A supplier on an active job writing about that job is subcontractor correspondence. A real invitation to bid from an owner, architect or public agency is a bid item.",
      },
    },
    internal: {
      owner: { to: "none" }, noun: "Team mail",
      criteria: {
        true: "Mail between Brightwater's own staff, including forwards of outside mail and assignments among them.",
        false: "Anything sent from outside the firm.",
      },
    },
  },
  low: ["noise", "internal"],
  datesAreNotClocks: ["noise", "internal", "invoice"],
  datedFloorHigh: ["inspection"],
  unloggedHigh: ["co", "bid"],
  repeatHigh: ["owner", "sub"],
  knownGaps: ["g051", "g058"],
};
