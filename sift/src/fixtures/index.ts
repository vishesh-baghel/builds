import type { Firm, Message } from "../types";
import { FIRMS } from "./firms";

export { FIRMS };

export const DEFAULT_FIRM_ID = "arch";

export function firmById(id: string): Firm {
  const found = FIRMS.find((f) => f.id === id);
  if (found) return found;
  const first = FIRMS[0];
  if (!first) throw new Error("no firms are loaded");
  return first;
}

export function messageById(firm: Firm, id: string): Message | undefined {
  return firm.messages.find((m) => m.id === id);
}
