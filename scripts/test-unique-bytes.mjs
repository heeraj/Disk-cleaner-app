/**
 * Pure-function checks for hierarchy unique-byte totals (1.4.0).
 * Run: npx tsx scripts/test-unique-bytes.mjs
 */
import assert from 'node:assert/strict';
import {
  annotateHierarchy,
  filterTopLevelItems,
  isPathInside,
  uniqueBytesTotal,
} from '../server/hierarchy.ts';

assert.equal(isPathInside('D:/Steam/steamapps/common/Game', 'D:/Steam'), true);
assert.equal(isPathInside('D:/Steam', 'D:/Steam'), false);
assert.equal(isPathInside('D:/SteamGames', 'D:/Steam'), false);

const steam = [
  { path: 'D:/Steam', sizeBytes: 800_000_000_000 },
  { path: 'D:/Steam/steamapps', sizeBytes: 700_000_000_000 },
  { path: 'D:/Steam/steamapps/common/GameA', sizeBytes: 120_000_000_000 },
  { path: 'D:/Steam/steamapps/common/GameB', sizeBytes: 90_000_000_000 },
  { path: 'D:/Videos', sizeBytes: 50_000_000_000 },
];

const raw = steam.reduce((s, i) => s + i.sizeBytes, 0);
assert.ok(raw > 1_500_000_000_000);

const unique = uniqueBytesTotal(steam);
assert.equal(unique, 850_000_000_000);

const top = filterTopLevelItems(steam);
assert.deepEqual(top.map((t) => t.path).sort(), ['D:/Steam', 'D:/Videos'].sort());

const annotated = annotateHierarchy(steam);
assert.equal(annotated.find((a) => a.path === 'D:/Steam').uniqueBytes, 800_000_000_000);
assert.equal(annotated.find((a) => a.path === 'D:/Steam').hasListedDescendants, true);
assert.equal(annotated.find((a) => a.path.endsWith('GameA')).uniqueBytes, 0);
assert.equal(annotated.find((a) => a.path.endsWith('GameA')).coveredByAncestor, true);

assert.equal(uniqueBytesTotal([steam[0], steam[1], steam[2]]), 800_000_000_000);

console.log('OK — unique-bytes hierarchy checks passed');
console.log(`  fixture raw=${(raw / 1e12).toFixed(2)}TB → unique=${(unique / 1e12).toFixed(2)}TB`);
