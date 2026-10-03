// sift: a shared inbox sorted, with the disguised deadlines flagged.
// Run: node demos/sift.mjs <outDir>
import { startRecording } from './lib/recorder.mjs';

const out = process.argv[2] || 'out/sift';
const { p, cam, wait, glide, box, clickOn, drag, finish } = await startRecording('https://sift.visheshbaghel.com', out);
const nav = (n) => p.locator('aside button').filter({ hasText: new RegExp('^' + n) }).first();

await wait(1500);

// 1. Overview: the headline numbers
cam(1.75, 840, 262);
await glide(370, 250, 1100);
await wait(1300);
await glide(700, 250, 900);
await wait(900);
await glide(1180, 250, 900);
await wait(1100);

// 2. The disguised deadlines in "needs attention first"
cam(1.6, 560, 610);
await glide(500, 706, 1000);
await wait(1500);
cam(1, 720, 450);
await wait(500);

// 3. Inbox, open the city's plan review letter
await clickOn(nav('Inbox'), 1000);
await wait(900);
const row = p.getByText('Plan review comments: Permit B-2026-0933').first();
const rc = await box(row);
cam(1.35, 700, rc.y);
await glide(rc.x, rc.y, 1100);
await wait(400);
await clickOn(row, 300);
await wait(700);
const cc = await box(p.getByText('Not sure what this is. A person should read it.').first());
cam(1.9, cc.x + 40, cc.y + 55);
await glide(cc.x + 150, cc.y + 70, 1100);
await wait(2200);
cam(1.6, 700, cc.y + 175);
await glide(760, cc.y + 175, 1200);
await wait(1800);
cam(1, 720, 450);
await wait(300);

// 4. Needs a decision
await clickOn(nav('Needs a decision'), 1000);
await wait(700);
cam(1.6, 640, 210);
await glide(760, 220, 1000);
await wait(2400);
cam(1, 720, 450);
await wait(300);

// 5. Autonomy slider, then back to the tested setting
await clickOn(nav('Autonomy'), 1000);
await wait(700);
cam(1.45, 640, 300);
await drag(p.locator('main input[type=range]').first(), [0.95, 0.2], 1900);
await clickOn(p.getByRole('button', { name: 'Tested', exact: true }), 700);
await wait(900);
cam(1, 720, 450);
await wait(300);

// 6. Another firm
const sel = p.locator('aside select').first();
await clickOn(sel, 1100);
await wait(500);
await sel.selectOption({ label: 'Law firm' });
await wait(600);
await clickOn(nav('Overview'), 800);
await wait(600);
cam(1.4, 720, 200);
await glide(760, 150, 1000);
await wait(2000);
cam(1, 720, 450);
await glide(1250, 760, 1300);
await wait(2000);

await finish();
