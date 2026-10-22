import {defineConfig} from '@playwright/test';
import base from './playwright.config';
// Self-contained candidate checks: no project-sync/outbox dependencies.
export default defineConfig({...base,testMatch:['accounts-flow.spec.ts','account-signout.spec.ts','email-session-boundary.spec.ts'],grep:/email login|email proof|email is primary|email mobile|email duplicate|email pending|email delivery|email server|verified email|sign-in handoff|session timer|server revoked|sign-out|signs out/,projects:[{name:'email-candidate',use:{viewport:{width:430,height:900}}}],use:{...base.use,baseURL:'http://127.0.0.1:5180'},webServer:{command:'npm run dev',url:'http://127.0.0.1:5180',reuseExistingServer:false}});
