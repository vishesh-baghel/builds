import type { TradeRules } from "./types";

/**
 * Northgate Property Group. The criteria are written from the class boundaries in
 * `fixtures/prop/README.md`: the class table and the labelling notes committed before any run was
 * scored. They state the same boundaries the labeller used. Nothing here was added from a run's
 * results.
 */
export const PROP: TradeRules = {
  topics: {
    maint: {
      owner: { to: "person", name: "Luis Ortega" }, noun: "A maintenance request",
      criteria: {
        true: "A repair or maintenance need at a unit, common area, grounds or building system, from anyone who reports it: a tenant, an owner, a neighbour, a vendor updating an open work order. A notice or report that orders physical repair work carries one too.",
        false: "A tenant upset about another resident, or about how they were treated, with nothing broken, is a complaint. A contractor's bill or quote is a vendor invoice. A notice that orders no physical work is only a compliance notice.",
      },
    },
    code: {
      owner: { to: "owner" }, noun: "A compliance notice",
      criteria: {
        true: "A notice from a city, county, housing authority, fire marshal, utility acting as regulator, or HOA about a violation, inspection, registration, licence, certification or other compliance duty, including approvals and closed cases, and including one forwarded by an owner, a tenant or staff.",
        false: "A private company imitating an official notice is a vendor pitch. An HOA or authority writing about money (dues, assistance payments) is a payment matter. A tenant's own complaint about a neighbour is a complaint.",
      },
    },
    lease: {
      owner: { to: "person", name: "Hannah Cole" }, noun: "A lease matter",
      criteria: {
        true: "Renewals, notices to vacate, applications, tours and availability, move-in and move-out, guarantors, lease terms and early termination, and the security deposit after move-out, whoever asks about the lease.",
        false: "Rent owed, late fees, returned payments and payment plans are payment matters. Staff discussing a lease among themselves is internal mail.",
      },
    },
    complaint: {
      owner: { to: "slot", slot: "coordinator" }, noun: "A tenant complaint",
      criteria: {
        true: "A resident complaining about another resident (noise, smoke, parking, pets), about how the firm or its crews treated them, or about a repair left unfixed or repeating, first time or a repeat chase.",
        false: "A plain repair request with no grievance is only a maintenance request. A vendor chasing its own invoice is not a complaint.",
      },
    },
    payment: {
      owner: { to: "person", name: "Peter Idowu" }, noun: "A payment matter",
      criteria: {
        true: "Rent and money owed to or by a property other than a vendor's bill: late or partial rent, returned payments (NSF), payment plans, fee disputes, rental assistance and housing assistance payments, HOA dues, owner distributions and rent reporting for owners.",
        false: "A contractor's or utility's bill is a vendor invoice. A deposit question after move-out is a lease matter.",
      },
    },
    vendor: {
      owner: { to: "person", name: "Peter Idowu" }, noun: "A vendor invoice or quote",
      criteria: {
        true: "A bill, statement or quote from a vendor, contractor or utility the firm uses or asked, including a vendor chasing payment on its own bill.",
        false: "A solicitation dressed as an invoice, which says it is not a bill, and an unsolicited offer from a vendor the firm never asked are vendor pitches.",
      },
    },
    noise: {
      owner: { to: "none" }, noun: "Vendor marketing",
      criteria: {
        true: "Unsolicited marketing, however urgent or official it sounds: software, services, directory listings, filing services, buyers, recruiting and event invitations, including 'final notice' and invoice-shaped solicitations.",
        false: "A quote the firm asked for, or a bill for work it ordered, is a vendor invoice. Mail from tenants, owners, HOAs or authorities is not a pitch.",
      },
    },
    internal: {
      owner: { to: "none" }, noun: "Team mail",
      criteria: {
        true: "Mail between the firm's own staff, including forwards and assignments among them.",
        false: "Anything sent from outside the firm, including owners of the properties.",
      },
    },
  },
  low: ["noise", "internal"],
  datesAreNotClocks: ["noise", "internal", "vendor"],
  datedFloorHigh: ["code"],
  unloggedHigh: ["maint"],
  repeatHigh: ["complaint"],
  knownGaps: ["p071", "p072"],
};
