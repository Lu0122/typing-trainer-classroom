const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { passages } = require('./seed');

// 每次新增/修改表结构就把这个数字 +1。
// 打开已有数据库时如果版本号落后，会先把整个库备份到 data/backup/ 再迁移，
// 万一迁移出问题，老师可以直接把备份文件改名回去，学生成绩不会丢。
const SCHEMA_VERSION = 1;
const BACKUP_KEEP = 5;

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

// 用 VACUUM INTO 做一致性快照：WAL 模式下直接复制 .db 文件会漏掉还没合并的写入。
function backupBeforeMigration(db, databasePath, fromVersion) {
  const dir = path.join(path.dirname(databasePath), 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = path.join(dir, `typing-v${fromVersion}-${stamp}.db`);
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  const old = fs.readdirSync(dir).filter((name) => name.endsWith('.db')).sort();
  for (const name of old.slice(0, Math.max(0, old.length - BACKUP_KEEP))) {
    fs.rmSync(path.join(dir, name), { force: true });
  }
  return file;
}

function createDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // 迁移前先判断：是不是已有数据的旧库，且结构版本落后。
  // 全新库（还没有 users 表）没什么可丢的，不备份。
  const existing = databasePath !== ':memory:' && tableExists(db, 'users');
  const fromVersion = Number(db.pragma('user_version', { simple: true })) || 0;
  let backupFile = null;
  if (existing && fromVersion < SCHEMA_VERSION) {
    try {
      backupFile = backupBeforeMigration(db, databasePath, fromVersion);
      console.log(`[db] 结构升级 v${fromVersion} → v${SCHEMA_VERSION}，已备份到 ${path.basename(backupFile)}`);
    } catch (error) {
      // 备份失败就不要冒险改结构，直接抛出，让老师看到而不是悄悄改坏。
      throw new Error(`数据库升级前备份失败，已停止升级以保护数据：${error.message}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS passages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      student_id TEXT,
      avatar_data TEXT,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bug_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      preconditions TEXT NOT NULL DEFAULT '',
      steps TEXT NOT NULL,
      test_data TEXT NOT NULL DEFAULT '',
      expected_result TEXT NOT NULL,
      actual_result TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'P2',
      frequency TEXT NOT NULL DEFAULT '每次',
      environment TEXT NOT NULL DEFAULT '',
      attachment_data TEXT,
      status TEXT NOT NULL DEFAULT '待处理',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      term TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_members (
      class_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      left_at INTEGER,
      PRIMARY KEY (class_id, user_id),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS challenge_sessions (
      id TEXT PRIMARY KEY,
      passage_id INTEGER NOT NULL,
      user_id INTEGER,
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      submitted_at INTEGER,
      FOREIGN KEY (passage_id) REFERENCES passages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      wrong_chars INTEGER NOT NULL DEFAULT 0,
      passage_id INTEGER,
      session_id TEXT UNIQUE,
      user_id INTEGER,
      category_snapshot TEXT,
      title_snapshot TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (passage_id) REFERENCES passages(id) ON DELETE SET NULL,
      FOREIGN KEY (session_id) REFERENCES challenge_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS training_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      lesson_title TEXT NOT NULL DEFAULT '',
      correct_chars INTEGER NOT NULL DEFAULT 0,
      wrong_chars INTEGER NOT NULL DEFAULT 0,
      accuracy REAL NOT NULL DEFAULT 100,
      speed REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER NOT NULL,
      source_key TEXT,
      is_finalized INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS typing_key_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      training_session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      key_code TEXT NOT NULL,
      expected_count INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      actual_errors_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (training_session_id) REFERENCES training_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL,
      lesson_title TEXT NOT NULL DEFAULT '',
      target_accuracy REAL NOT NULL DEFAULT 0,
      target_speed REAL NOT NULL DEFAULT 0,
      due_at INTEGER,
      audience TEXT NOT NULL DEFAULT 'all',
      class_id INTEGER,
      student_ids_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignment_progress (
      assignment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      training_session_id INTEGER,
      best_accuracy REAL NOT NULL DEFAULT 0,
      best_speed REAL NOT NULL DEFAULT 0,
      completed_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (assignment_id, user_id),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (training_session_id) REFERENCES training_sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores(score DESC, accuracy DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scores_created ON scores(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_passages_category ON passages(category, is_active);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_training_sessions_user_time ON training_sessions(user_id, completed_at ASC);
    CREATE INDEX IF NOT EXISTS idx_training_sessions_time ON training_sessions(completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_classes_active ON classes(is_active, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_class_members_user ON class_members(user_id, left_at, joined_at DESC);
    CREATE INDEX IF NOT EXISTS idx_class_members_class ON class_members(class_id, left_at, joined_at DESC);
    CREATE INDEX IF NOT EXISTS idx_typing_key_stats_user_key ON typing_key_stats(user_id, key_code, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_typing_key_stats_session ON typing_key_stats(training_session_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_active_due ON assignments(is_active, due_at);
    CREATE INDEX IF NOT EXISTS idx_assignment_progress_user ON assignment_progress(user_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS admin_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT NOT NULL DEFAULT '阿里云百炼',
      base_url TEXT NOT NULL DEFAULT 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model TEXT NOT NULL DEFAULT 'qwen-flash',
      role_prompt TEXT NOT NULL DEFAULT '你是一名真实的电商消费者，正在与客服沟通。请保持自然、具体、有情绪但不夸张，围绕订单、物流、退换货、售后和商品体验提出合理诉求。',
      api_key_ciphertext TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_service_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      scenario_json TEXT NOT NULL,
      history_json TEXT NOT NULL DEFAULT '[]',
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      ended_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customer_service_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES customer_service_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_customer_service_sessions_user ON customer_service_sessions(user_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_service_results_user ON customer_service_results(user_id, created_at DESC);
  `);

  const challengeColumns = db.pragma('table_info(challenge_sessions)');
  if (!challengeColumns.some((column) => column.name === 'user_id')) {
    db.exec('ALTER TABLE challenge_sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  const scoreColumns = db.pragma('table_info(scores)');
  if (!scoreColumns.some((column) => column.name === 'session_id')) {
    db.exec('ALTER TABLE scores ADD COLUMN session_id TEXT REFERENCES challenge_sessions(id) ON DELETE SET NULL');
  }
  if (!scoreColumns.some((column) => column.name === 'user_id')) {
    db.exec('ALTER TABLE scores ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
  if (!scoreColumns.some((column) => column.name === 'category_snapshot')) {
    db.exec('ALTER TABLE scores ADD COLUMN category_snapshot TEXT');
  }
  if (!scoreColumns.some((column) => column.name === 'title_snapshot')) {
    db.exec('ALTER TABLE scores ADD COLUMN title_snapshot TEXT');
  }
  db.exec(`UPDATE scores SET category_snapshot = (SELECT category FROM passages WHERE passages.id = scores.passage_id),
    title_snapshot = (SELECT title FROM passages WHERE passages.id = scores.passage_id)
    WHERE category_snapshot IS NULL OR title_snapshot IS NULL`);
  const assignmentColumns = db.pragma('table_info(assignments)');
  if (!assignmentColumns.some((column) => column.name === 'class_id')) {
    db.exec('ALTER TABLE assignments ADD COLUMN class_id INTEGER');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, is_active, due_at)');
  const userColumns = db.pragma('table_info(users)');
  if (!userColumns.some((column) => column.name === 'avatar_data')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_data TEXT');
  }
  if (!userColumns.some((column) => column.name === 'student_id')) {
    db.exec('ALTER TABLE users ADD COLUMN student_id TEXT');
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_id_unique ON users(lower(trim(student_id))) WHERE student_id IS NOT NULL AND trim(student_id) <> ''");
  const aiColumns = db.pragma('table_info(ai_settings)');
  if (!aiColumns.some((column) => column.name === 'role_prompt')) {
    db.exec("ALTER TABLE ai_settings ADD COLUMN role_prompt TEXT NOT NULL DEFAULT '你是一名真实的电商消费者，正在与客服沟通。请保持自然、具体、有情绪但不夸张，围绕订单、物流、退换货、售后和商品体验提出合理诉求。'");
  }
  db.exec("UPDATE ai_settings SET role_prompt = '你是一名真实的电商消费者，正在与客服沟通。请保持自然、具体、有情绪但不夸张，围绕订单、物流、退换货、售后和商品体验提出合理诉求。' WHERE role_prompt IS NULL OR trim(role_prompt) = ''");
  const trainingColumns = db.pragma('table_info(training_sessions)');
  if (!trainingColumns.some((column) => column.name === 'source_key')) {
    db.exec('ALTER TABLE training_sessions ADD COLUMN source_key TEXT');
  }
  if (!trainingColumns.some((column) => column.name === 'is_finalized')) {
    db.exec('ALTER TABLE training_sessions ADD COLUMN is_finalized INTEGER NOT NULL DEFAULT 1');
  }
  db.exec("UPDATE training_sessions SET is_finalized = 0 WHERE lesson_title LIKE '%（进行中）' AND is_finalized = 1");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_training_sessions_source ON training_sessions(source_key) WHERE source_key IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_training_sessions_finalized ON training_sessions(is_finalized, completed_at DESC)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_session ON scores(session_id) WHERE session_id IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_scores_user_rank ON scores(user_id, score DESC, accuracy DESC, created_at ASC)');
  const duplicateNames = db.prepare(`
    SELECT lower(trim(display_name)) AS normalized_name, COUNT(*) AS total
    FROM users GROUP BY lower(trim(display_name)) HAVING total > 1
  `).all();
  if (!duplicateNames.length) {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_unique ON users(lower(trim(display_name)))');
  }

  const insert = db.prepare(`
    INSERT INTO passages (title, category, content)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM passages WHERE title = ? AND category = ?)
  `);
  const seedAll = db.transaction(() => {
    const seedPassages = databasePath === ':memory:'
      ? passages.filter((passage) => !['英文打字', '拼音打字'].includes(passage.category))
      : passages;
    seedPassages.forEach((passage) => insert.run(
      passage.title,
      passage.category,
      passage.content,
      passage.title,
      passage.category
    ));
  });
  seedAll();

  // 迁移完成（或本来就是新库）后记下结构版本，下次就不会重复备份。
  db.pragma(`user_version = ${SCHEMA_VERSION}`);

  return db;
}

module.exports = { createDatabase };
