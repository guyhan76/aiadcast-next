import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testMatch:'google-signin.spec.ts',projects:base.projects!.filter(p=>p.name==='desktop'||p.name==='mobile'),webServer:{command:'npm run preview',url:'http://127.0.0.1:4180',reuseExistingServer:false}});
