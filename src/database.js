const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { passages } = require('./seed');

function createDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

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
  const assignmentColumns = db.pragma('table_info(assignments)');
  if (!assignmentColumns.some((column) => column.name === 'class_id')) {
    db.exec('ALTER TABLE assignments ADD COLUMN class_id INTEGER');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, is_active, due_at)');
  const userColumns = db.pragma('table_info(users)');
  if (!userColumns.some((column) => column.name === 'avatar_data')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_data TEXT');
  }
  const trainingColumns = db.pragma('table_info(training_sessions)');
  if (!trainingColumns.some((column) => column.name === 'source_key')) {
    db.exec('ALTER TABLE training_sessions ADD COLUMN source_key TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_training_sessions_source ON training_sessions(source_key) WHERE source_key IS NOT NULL');
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

  return db;
}

module.exports = { createDatabase };
