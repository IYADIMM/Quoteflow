import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const tests = readdirSync(new URL('../tests', import.meta.url)).filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`);
const node = process.execPath, commands = [
  [node, ['node_modules/prisma/build/index.js','validate']],
  [node, ['node_modules/prisma/build/index.js','generate']],
  [node, ['--test',...tests]],
  [node, ['scripts/build.mjs']]
];
for (const [command,args,options={}] of commands) {
  const result = spawnSync(command,args,{ cwd:new URL('..',import.meta.url),stdio:'inherit',...options });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('RELEASE_CHECK_PASSED');
