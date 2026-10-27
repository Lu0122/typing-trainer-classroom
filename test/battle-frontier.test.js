const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = () => import(pathToFileURL(path.join(__dirname, '../frontend/src/battle-frontier.mjs')).href);
test('smooth tactical frontier stays bounded and preserves occupied area', async () => {
  const { sampleFrontier, softenFrontier } = await load();
  for (const frontier of [Array(18).fill(0), Array(18).fill(36), [18,19,17,20,16,18,19,17,18,17,18,19,17,20,16,18,19,18], Array.from({length:18},(_,i)=>i%2 ? 36:0)]) {
    const softened = softenFrontier(frontier);
    assert.ok(Math.abs(softened.reduce((sum,n)=>sum+n,0)-frontier.reduce((sum,n)=>sum+n,0))<.000001);
    const steps = 18000; let area = 0;
    for (let i=0;i<steps;i++) {
      const x = sampleFrontier(frontier, (i+.5)*18/steps);
      assert.ok(x>=0 && x<=36);
      area += x*18/steps;
    }
    assert.ok(Math.abs(area-frontier.reduce((sum,n)=>sum+n,0))<.0001);
    assert.equal(sampleFrontier(frontier,0),frontier[0]);
    assert.equal(sampleFrontier(frontier,18),frontier[17]);
  }
});
