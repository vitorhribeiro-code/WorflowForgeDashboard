import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gate grosseiro no Edge: sem cookie `session`, nem chega ao painel.
// A verificação REAL do token (assinatura/expiração) é feita no server component
// via getSession — isto é só o primeiro filtro, barato e sem tocar na BD.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/console/:path*"],
};
