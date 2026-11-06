export function hasStudentClassId(row) {
  return !!row && Object.prototype.hasOwnProperty.call(row, 'classId');
}
