// upweight: the HN front page re-ranked live by six weights.
// Run: node demos/upweight.mjs <outDir>
import { startRecording } from './lib/recorder.mjs';

const out = process.argv[2] || 'out/upweight';
const { p, cam, wait, glide, box, clickOn, drag, scrollBy, finish } = await startRecording('https://upweight.visheshbaghel.com', out);
const preset = (name) => p.getByRole('button', { name, exact: true });

await wait(1100);

// 1. The front page, scored: the top story and its six numbers
cam(1.7, 620, 190);
await glide(620, 152, 900);
await wait(1000);
await glide(560, 240, 700);
await wait(500);
await glide(1080, 240, 800);
await wait(1000);
await glide(1240, 202, 600);
await wait(700);

// 2. Presets re-rank the list on the spot
cam(1.25, 560, 330);
await clickOn(preset('Max drama'), 900);
await wait(2200);
await clickOn(preset('Slop filter'), 700);
await wait(2200);
await clickOn(preset('Balanced'), 700);
await wait(600);

// 3. Drag one weight end to end and watch the order follow
const slop = p.locator('input[type=range]').nth(3);
cam(1.3, 560, 450);
await drag(slop, [1, 0.05], 1600);
await wait(1200);

// 4. The raw request and response behind one story
cam(1, 720, 450);
const raw = await clickOn(p.getByRole('button', { name: 'request and response' }).first(), 900);
await wait(700);
cam(1.55, 760, raw.y + 230);
await glide(760, raw.y + 140, 800);
await wait(1500);
await scrollBy(470, 1100);
cam(1.55, 760, 500);
await glide(700, 560, 800);
await wait(2600);
cam(1, 720, 450);
await scrollBy(-470, 900);
await clickOn(p.getByRole('button', { name: /hide request and response/ }).first(), 700);
await wait(300);

// 5. Why it is instant: the answers are numbers, ranked in the browser
await clickOn(p.getByRole('button', { name: 'How this works' }), 900);
await wait(700);
const numbers = await box(p.getByText('The answers come back as numbers', { exact: false }).first());
cam(1.6, 700, numbers.y + 80);
await glide(560, numbers.y + 70, 900);
await wait(3400);
cam(1, 720, 450);
await p.keyboard.press('Escape');
await wait(500);

// 6. Reset puts the front page back, then pull back
await clickOn(p.getByRole('button', { name: 'Reset', exact: true }), 1000);
await wait(1400);
await glide(1250, 760, 1100);
await wait(1800);

await finish();
