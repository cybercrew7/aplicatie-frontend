// The app is deployed as a static SPA (adapter-static + Nginx fallback):
// every page renders in the browser, and nothing is prerendered at build time.
export const ssr = false;
export const prerender = false;
