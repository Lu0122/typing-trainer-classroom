const test = require('node:test');
const assert = require('node:assert/strict');
const { listPage } = require('../backend/pagination');

test('defaults to 20 per page and clamps the page into range', () => {
  assert.deepEqual(listPage({}, 0), { page: 1, pageSize: 20, pages: 1, offset: 0 });
  assert.deepEqual(listPage({ page: '2' }, 26), { page: 2, pageSize: 20, pages: 2, offset: 20 });
  assert.deepEqual(listPage({ page: '99' }, 26), { page: 2, pageSize: 20, pages: 2, offset: 20 }, '越界页夹到最后一页');
  assert.deepEqual(listPage({ page: '-3' }, 26), { page: 1, pageSize: 20, pages: 2, offset: 0 }, '非法页夹到第一页');
});

test('keeps pageSize between 10 and 50', () => {
  assert.equal(listPage({ pageSize: '5' }, 100).pageSize, 10);
  assert.equal(listPage({ pageSize: '999' }, 100).pageSize, 50);
  assert.equal(listPage({ pageSize: 'abc' }, 100).pageSize, 20);
});
