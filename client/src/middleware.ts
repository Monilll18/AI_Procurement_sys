import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define which routes are public (accessible without sign-in)
const isPublicRoute = createRouteMatcher([
    "/",              // Landing page
    "/sign-in(.*)",   // Sign-in pages
    "/sign-up(.*)",   // Sign-up pages
    "/api/webhooks(.*)", // Webhook endpoints
]);

// Routes that signed-in users should be redirected away from
const isAuthPageRoute = createRouteMatcher([
    "/",              // Landing page
    "/sign-in(.*)",   // Sign-in pages
    "/sign-up(.*)",   // Sign-up pages
]);

export default clerkMiddleware(async (auth, request) => {
    const { userId } = await auth();

    // If signed in and visiting landing/auth pages → redirect to dashboard
    if (userId && isAuthPageRoute(request)) {
        const dashboardUrl = new URL("/dashboard", request.url);
        return NextResponse.redirect(dashboardUrl);
    }

    // If NOT signed in and trying to access protected routes → redirect to landing
    if (!userId && !isPublicRoute(request)) {
        const landingUrl = new URL("/", request.url);
        return NextResponse.redirect(landingUrl);
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // Always run for API routes
        "/(api|trpc)(.*)",
    ],
};
