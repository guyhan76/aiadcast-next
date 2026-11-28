import {defineConfig} from '@playwright/test';
import base from './playwright.config';
// UI contracts run against the built preview; module boundaries run against Vite source.
// Both remain included in the default CI suite, with no skipped assertions.
export default defineConfig({...base,testMatch:['accounts-flow.spec.ts','account-signout.spec.ts','account-credits.spec.ts','email-session-boundary.spec.ts'],grep:/email login|email proof|email is primary|email mobile|email duplicate|email pending|email delivery|email server|verified email|sign-in handoff|session timer|server revoked|sign-out|signs out|malformed purchase and expired/});
