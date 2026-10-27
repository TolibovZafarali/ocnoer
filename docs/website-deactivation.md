# Website deactivation

The website is inactive. Its middleware returns an empty `410 Gone` response
with `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow, noarchive`
for every path and method. This includes the nebula homepage, story reader,
admin pages, public files, framework assets, APIs, and server actions.

The shutdown middleware does not import authentication, database, Storage,
or page-rendering code. It does not redirect visitors or invoke application
handlers. No environment variable enables a bypass.

All web and backend implementation files remain in the repository. The previous
homepage-only middleware is preserved in `lib/website/homepage-only-gate.ts` and
is not imported by the active middleware. A future restoration requires an
intentional source change and deployment.

Next.js URL normalization and automatic trailing-slash redirects are disabled
so the shutdown response can handle those URLs directly. The matcher includes
all paths without static-asset, image, or API exclusions.

Run `corepack pnpm exec vitest run middleware.test.ts` to check the route matcher,
methods, response headers, and framework request variants. After deploying,
verify that the production domain and deployment aliases return `410` for `/`,
`/play`, `/admin`, `/api/mobile/player/session`, `/nebula.svg`, and an actual
`/_next/static/` asset. Verify a POST request as well. A local test alone does
not deactivate a previously deployed website.
