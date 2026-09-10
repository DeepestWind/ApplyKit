import path from 'node:path';
import { ROOT, cleanDir, bundle, copyPublic, verifyManifestReferences, dirSize } from './build-lib.mjs';

const watch = process.argv.includes('--watch');
const outdir = path.join(ROOT, 'dist');

await cleanDir(outdir);
const manifest = await copyPublic(outdir);
await bundle({ outdir, watch, sourcemap: watch, minify: !watch });

if (watch) {
  console.log('[build] watching src/ ... dist/ 已生成，修改后需要在 chrome://extensions 重新加载扩展');
} else {
  await verifyManifestReferences(outdir, manifest);
  const forbidden = ['tabs', 'history', 'cookies', 'debugger', 'downloads', '<all_urls>'];
  const declared = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])];
  const leaked = declared.filter((p) => forbidden.includes(p));
  if (leaked.length > 0) throw new Error(`生产 manifest 不应包含权限: ${leaked.join(', ')}`);
  if (manifest.host_permissions) throw new Error('生产 manifest 不应声明 host_permissions');
  console.log(`[build] dist/ 完成，${(await dirSize(outdir) / 1024).toFixed(1)} KiB，权限: ${declared.join(', ')}`);
}
