const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');
test('student management returns the actual class ID even when names match and one class is disabled', async () => {
  const db = createDatabase(':memory:');
  try {
    const app = createApp({ db, adminPassword: 'test-pass' });
    const admin = request.agent(app);
    await admin.post('/api/admin/login').send({ password:'test-pass' }).expect(200);
    const a = await admin.post('/api/admin/classes').send({name:'同名班',term:'第一期'}).expect(201);
    const b = await admin.post('/api/admin/classes').send({name:'同名班',term:'第二期'}).expect(201);
    await admin.post('/api/admin/users').send({displayName:'学生甲',studentId:'20260001',classId:a.body.id}).expect(201);
    await admin.post('/api/admin/users').send({displayName:'学生乙',studentId:'20260002',classId:b.body.id}).expect(201);
    await admin.patch(`/api/admin/classes/${b.body.id}/status`).send({isActive:false}).expect(200);
    const users = await admin.get('/api/admin/users?pageSize=50').expect(200);
    assert.equal(users.body.rows.find(u=>u.displayName==='学生甲').classId,a.body.id);
    assert.equal(users.body.rows.find(u=>u.displayName==='学生乙').classId,b.body.id);
  } finally { db.close(); }
});
