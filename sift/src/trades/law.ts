import type { TradeRules } from "./types";

/**
 * Hale & Marrow LLP. The criteria are written from the class boundaries in `fixtures/law/README.md`:
 * the class table and the labelling notes committed before any run was scored. They state the same
 * boundaries the labeller used, so the boundary the model is asked about is the boundary it is scored
 * against. Nothing here was added from a run's results.
 */
export const LAW: TradeRules = {
  topics: {
    court: {
      owner: { to: "owner" }, noun: "A court notice",
      criteria: {
        true: "A notice, order, minute order or automated e-filing message from a court or its clerk about a case: scheduling orders, returned or rejected filings, hearing notices, reassignments, orders to show cause, including one a client or opposing counsel forwards.",
        false: "A vendor, directory or records service writing in court-like language is a pitch. Opposing counsel's own letter about a hearing is opposing counsel. The firm's staff discussing a court date among themselves is internal mail.",
      },
    },
    discovery: {
      owner: { to: "slot", slot: "lead" }, noun: "Discovery",
      criteria: {
        true: "Discovery served on or by a party, or correspondence about it: interrogatories, requests for production or admission, deposition notices and scheduling, subpoenas for records, responses, productions and deficiency letters, whoever passes it along.",
        false: "A court's order on a discovery motion is a court notice. A letter from opposing counsel about settlement, a stipulation or a pleading, with no discovery in it, is opposing counsel correspondence.",
      },
    },
    opposing: {
      owner: { to: "slot", slot: "lead" }, noun: "Opposing counsel",
      criteria: {
        true: "A letter from the other side's lawyer that asks the firm for something or tells it something about the case: meet and confer requests, stipulations, extensions, settlement offers, tolling agreements, courtesy copies of their filings. A deficiency letter that demands a meet and confer is both this and discovery.",
        false: "A plain cover note serving discovery, asking nothing else, is discovery only. A court's own notice forwarded by opposing counsel is still a court notice as well.",
      },
    },
    client: {
      owner: { to: "slot", slot: "lead" }, noun: "The client asking for an update",
      criteria: {
        true: "A current client, or someone writing for one, asking about their matter: progress, next steps, a hearing, a deposition, what happens next, first ask or repeat.",
        false: "Someone asking whether the firm will take a new matter is a new-matter inquiry, even a former client. A client's question about an invoice or a trust deposit is billing. Opposing counsel or the court is never the client.",
      },
    },
    intake: {
      owner: { to: "person", name: "Lila Moss" }, noun: "A new-matter inquiry",
      criteria: {
        true: "Someone who is not a client on an open matter asking the firm to take a new one, or a referral of one from another lawyer or an answering service, including a former client with a new problem.",
        false: "An existing client asking about their open matter is a client update. A vendor selling leads or intake software is a pitch.",
      },
    },
    billing: {
      owner: { to: "person", name: "Kevin Tran" }, noun: "A billing item",
      criteria: {
        true: "A bill or statement to the firm (experts, court reporters, mediators, e-discovery hosting, process servers), a payment or trust account item (retainer deposits, trust statements, bank or bar trust notices), or a client's question about their own invoice.",
        false: "A solicitation that says it is not a bill is a pitch. A filing rejected by a court for a fee problem is a court notice.",
      },
    },
    noise: {
      owner: { to: "none" }, noun: "Vendor marketing",
      criteria: {
        true: "Unsolicited marketing, however urgent or official it sounds: research tool trials, CLE and conference promotions, directory listings, lead sellers, litigation funders, staffing and software demos.",
        false: "A bill for something the firm actually bought is billing. Mail from a court, a client, a prospective client or opposing counsel is not a pitch.",
      },
    },
    internal: {
      owner: { to: "none" }, noun: "Team mail",
      criteria: {
        true: "Mail between the firm's own staff, including forwards and assignments among them.",
        false: "Anything sent from outside the firm, even when it copies someone at the firm.",
      },
    },
  },
  low: ["noise", "internal"],
  datesAreNotClocks: ["noise", "internal", "billing"],
  datedFloorHigh: ["court"],
  unloggedHigh: ["discovery"],
  repeatHigh: ["client", "opposing"],
  knownGaps: ["l048", "l049", "l087"],
};
