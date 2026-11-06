const test = require('node:test');
const assert = require('node:assert/strict');
test('student editing requires server classId support, including explicit null for unassigned', async () => {
  const { hasStudentClassId } = await import('../frontend/src/admin-next/student-edit-compat.mjs');
  assert.equal(hasStudentClassId({ id: 1, displayName: '学生' }), false);
  assert.equal(hasStudentClassId({ id: 1, classId: null }), true);
  assert.equal(hasStudentClassId({ id: 1, classId: 7 }), true);
});
