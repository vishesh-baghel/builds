import { NextResponse } from "next/server";

/**
 * An opaque browser id, not a person.
 *
 * It exists only so one visitor's allowance is not another's. It is not an account, it is
 * linked to nothing, and the only thing ever written against it is a count of calls. No reply
 * text — committed or visitor-written — is stored against it, or stored at all.
 */
export const VISITOR_COOKIE = "reckon_vid";

export function readVisitor(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const found = new RegExp(`${VISITOR_COOKIE}=([0-9a-f-]{36})`).exec(cookie);
  return found?.[1] ?? crypto.randomUUID();
}

export function withCookie(response: NextResponse, visitor: string): NextResponse {
  response.cookies.set({
    name: VISITOR_COOKIE, value: visitor, httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
