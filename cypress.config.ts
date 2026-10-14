import { defineConfig } from 'cypress'

/**
 * Cypress configuration for Easy Quiz.
 *
 * The specs drive the real app against a local Supabase stack, so the browser
 * default is Edge (see the `e2e` scripts in package.json, which pass
 * `--browser edge`) and `baseUrl` points at the Vite dev server.
 *
 * Prerequisites before `npm run e2e`:
 *   npm run supabase:start
 *   npm run dev
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    // A run is graded by assertions, not by a video; keep CI light.
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 12_000,
    requestTimeout: 20_000,
    responseTimeout: 20_000,
    viewportWidth: 1280,
    viewportHeight: 900,
    // One retry in a full run absorbs a cold Supabase/anonymous-sign-in hiccup.
    retries: { runMode: 1, openMode: 0 },
    setupNodeEvents() {
      // no-op — the app talks to Supabase directly
    },
  },
})
