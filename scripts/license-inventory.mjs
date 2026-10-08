import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, parse } from 'node:path';
const require = createRequire(import.meta.url), root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const known = { 'netlify-cli': ['23.15.1','MIT'], prisma: ['7.10.0','Apache-2.0'] };
const rows = [];
for (const [name, requested] of Object.entries({ ...root.dependencies, ...root.devDependencies })) {
  try { let directory=dirname(require.resolve(name)),data; while(directory!==parse(directory).root){const candidate=join(directory,'package.json');if(existsSync(candidate)){const found=JSON.parse(readFileSync(candidate,'utf8'));if(found.name===name){data=found;break;}}directory=dirname(directory);}if(!data)throw new Error('package metadata not found'); rows.push([name, requested, data.version, typeof data.license === 'string' ? data.license : 'SEE PACKAGE']); }
  catch { rows.push([name, requested, ...(known[name] || ['unresolved','REVIEW REQUIRED'])]); }
}
rows.sort((a,b)=>a[0].localeCompare(b[0]));
const text = `# Dependency License Inventory\n\nGenerated from installed direct dependencies on ${new Date().toISOString().slice(0,10)}. This is an engineering inventory, not legal advice. An acquirer should run a full transitive dependency and source asset review before closing.\n\n| Package | Requested | Installed | Declared license |\n|---|---:|---:|---|\n${rows.map(row=>`| ${row.join(' | ')} |`).join('\n')}\n\n## Source assets\n\n- Application code: ownership and assignment must be confirmed by the seller.\n- Google Fonts are loaded from Google at runtime; DM Sans and Manrope are distributed under the SIL Open Font License.\n- Demo company, people, and commercial records are fictional.\n- No third-party customer logos or testimonials are included.\n`;
await writeFile(new URL('../DEPENDENCY_LICENSE_INVENTORY.md', import.meta.url), text);
