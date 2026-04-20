import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

// The middleware wrapper handles OAuth code exchange (setting auth cookies).
// Route protection is handled client-side by AuthGuard.
export default convexAuthNextjsMiddleware();

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
