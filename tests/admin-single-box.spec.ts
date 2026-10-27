import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('daily admin no longer mounts either historical photo tool; server implementation retained',()=>{
 const admin=readFileSync('src/AdminPage.tsx','utf8');expect(admin).not.toMatch(/AdminReferenceEvaluation|SingleBoxEvaluation|showDiagnostics/);
 expect(readFileSync('server/beta-server.mjs','utf8')).toContain('/api/admin/single-box-evaluation');
 expect(readFileSync('server/vision-evaluation/single-box-service.mjs','utf8')).toContain('singleBoxService');
});
