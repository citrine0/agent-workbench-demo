import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/workbench-v2", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
