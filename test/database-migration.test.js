const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../backend/database');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-db-'));
  // Windows 上 sqlite 句柄释放有延迟，删临时目录可能 EBUSY。
  // 这是清理动作，不该影响「数据有没有被保护」的结论，所以失败就留给系统临时目录。
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* 忽略 */ } };
  return { dir, file: path.join(dir, 'typing.db'), cleanup };
}

test('a brand-new database is stamped with the schema version and needs no backup', () => {
  const { dir, file, cleanup } = tempDb();
  try {
    const db = createDatabase(file);
    assert.equal(Number(db.pragma('user_version', { simple: true })), 1, '新库直接标记为当前结构版本');
    assert.equal(fs.existsSync(path.join(dir, 'backup')), false, '全新库没有数据可丢，不该产生备份');
    db.close();
  } finally { cleanup(); }
});

test('upgrading an existing database backs it up before touching the schema', () => {
  const { dir, file, cleanup } = tempDb();
  try {
    // 先造一个有学生成绩的库
    let db = createDatabase(file);
    db.prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)').run('stu1', '学生甲', 'hash');
    db.prepare('INSERT INTO scores (nickname, score, accuracy, created_at) VALUES (?, ?, ?, ?)').run('学生甲', 88, 96, new Date().toISOString());
    // 模拟「教师机上是老版本」：结构版本回退
    db.pragma('user_version = 0');
    db.close();

    const reopened = createDatabase(file);
    const backupDir = path.join(dir, 'backup');
    assert.ok(fs.existsSync(backupDir), '升级前必须生成备份目录');
    const backups = fs.readdirSync(backupDir).filter((name) => name.endsWith('.db'));
    assert.equal(backups.length, 1, '应该正好生成一个备份文件');
    assert.match(backups[0], /^typing-v0-/, '备份文件名带上升级前版本，便于老师辨认');

    // 数据必须原样还在
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM scores').get().n, 1);
    assert.equal(Number(reopened.pragma('user_version', { simple: true })), 1, '升级后写入新版本号');
    reopened.close();

    // 备份本身也要能打开，且含同样数据
    const Database = require('better-sqlite3');
    const snapshot = new Database(path.join(backupDir, backups[0]), { readonly: true });
    assert.equal(snapshot.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1, '备份里要有学生数据');
    snapshot.close();
  } finally { cleanup(); }
});

test('reopening an already-migrated database does not create another backup', () => {
  const { dir, file, cleanup } = tempDb();
  try {
    createDatabase(file).close();
    const db = createDatabase(file);
    db.close();
    assert.equal(fs.existsSync(path.join(dir, 'backup')), false, '版本没变就不该反复备份');
  } finally { cleanup(); }
});

test('keeps only the newest five migration backups', () => {
  const { dir, file, cleanup } = tempDb();
  try {
    let db = createDatabase(file);
    db.prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)').run('stu1', '学生甲', 'hash');
    db.close();
    const backupDir = path.join(dir, 'backup');
    fs.mkdirSync(backupDir, { recursive: true });
    for (let index = 0; index < 7; index += 1) {
      fs.writeFileSync(path.join(backupDir, `typing-v0-2026010100000${index}.db`), '');
    }
    // 回退版本号触发一次真实迁移，迁移会顺带裁剪旧备份
    const raw = createDatabase(file);
    raw.pragma('user_version = 0');
    raw.close();
    createDatabase(file).close();
    const left = fs.readdirSync(backupDir).filter((name) => name.endsWith('.db'));
    assert.ok(left.length <= 5, `备份最多保留 5 个，实际 ${left.length}`);
  } finally { cleanup(); }
});
