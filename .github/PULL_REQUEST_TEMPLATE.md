## Summary
Briefly describe the change and why it is needed.

## Verification Checklist
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` (Vitest) passes
- [ ] `npm run build` and `npm run test:e2e` (Playwright) pass
- [ ] Zero persistent `content_scripts` or `web_accessible_resources` introduced
- [ ] No untrusted `innerHTML` usage added
- [ ] No personal student data committed to demo/test fixtures
