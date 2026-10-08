import { mkdir, copyFile, cp } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css']) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, output));
}
await cp(new URL('../assets/', import.meta.url), new URL('assets/', output), { recursive: true });
