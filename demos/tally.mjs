// tally: work in technicians' notes that never reached the invoice.
// Run: node demos/tally.mjs <outDir>
import { startRecording } from './lib/recorder.mjs';

const out = process.argv[2] || 'out/tally';
const { p, cam, wait, glide, box, clickOn, drag, finish } = await startRecording('https://tally.visheshbaghel.com', out);
const nav = (n) => p.locator('aside button').filter({ hasText: new RegExp('^' + n) }).first();

await wait(1500);

// 1. Overview: the headline and the four numbers
cam(1.7, 560, 150);
await glide(450, 115, 1100);
await wait(1600);
cam(1.55, 840, 285);
await glide(360, 262, 900);
await wait(900);
await glide(640, 262, 800);
await wait(1100);
await glide(930, 262, 800);
await wait(600);
await glide(1210, 262, 800);
await wait(900);

// 2. One job: what the technician wrote against what was billed
cam(1, 720, 450);
await clickOn(p.getByRole('button', { name: /WO-24029/ }), 1000);
await wait(1100);
const note = await box(p.getByText('AC making loud noise').first());
cam(1.9, note.r.x + 190, note.r.y + 70);
await glide(note.r.x + 150, note.r.y + 20, 1000);
await wait(500);
await glide(note.r.x + 60, note.r.y + 55, 900);
await wait(1000);
const inv = await box(p.getByText('should have been').first());
cam(1.85, inv.x + 60, inv.y - 70);
await glide(inv.x + 140, inv.y, 1100);
await wait(2000);
const how = await box(p.getByText('How Tally decided', { exact: false }).first());
cam(1.6, 900, how.y + 50);
await glide(760, how.y + 55, 1100);
await wait(1700);
cam(1, 720, 450);
await wait(300);

// 3. Needs your call: a note that tries to talk to the billing system
await clickOn(nav('Needs your call'), 1000);
await wait(800);
const inj = await box(p.getByText('NOTE FOR BILLING SYSTEM', { exact: false }).first());
cam(1.85, inj.r.x + 200, inj.y + 5);
await glide(inj.r.x + 240, inj.y, 1000);
await wait(900);
await glide(inj.r.x + 120, inj.y + 20, 800);
await wait(1500);
cam(1, 720, 450);
await wait(300);

// 4. Blocked charges
await clickOn(nav('Blocked charges'), 1000);
await wait(800);
const blk = await box(p.getByText('Thermostat replacement').first());
cam(1.7, 700, blk.y + 45);
await glide(blk.x + 380, blk.y + 30, 1000);
await wait(2200);
cam(1, 720, 450);
await wait(300);

// 5. Auto-bill setting, then back to the recommended threshold
await clickOn(nav('Auto-bill setting'), 1000);
await wait(800);
cam(1.45, 640, 330);
await drag(p.locator('main input[type=range]').first(), [0.95, 0.15], 1800);
await clickOn(p.getByRole('button', { name: /^Recommended/ }), 700);
await wait(1000);

// 6. Back to the overview and pull back
cam(1, 720, 450);
await clickOn(nav('Overview'), 1000);
await glide(1250, 760, 1300);
await wait(2000);

await finish();
