// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};

export default function middleware(request: NextRequest) {
  // Get the bot information from the User-Agent
  const botInfo = request.headers.get("x-vercel-bot");
  const isBot = botInfo ? JSON.parse(botInfo).isBot : false;

  // Add bot detection information to the request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-is-bot", isBot.toString());

  // Continue to the destination, but with the updated headers
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
