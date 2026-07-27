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
  // Nota: o matcher só cobre PÁGINAS. As API-routes (/api/connections/*),
  // incluindo o callback OAuth, ficam de fora — como devem, pois o callback
  // autentica-se pelo `state` assinado, não pelo cookie de sessão.
  matcher: ["/dashboard/:path*", "/console/:path*", "/connections/:path*"],
};
