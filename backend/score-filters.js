// 竞速成绩的筛选条件。
// 后台「竞速成绩」页的列表/导出，和 AI 助手的 export_scores 必须用同一套口径，
// 否则同一个问题在两个入口会得到不同数字。所以这里抽成唯一来源。

function trim(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function buildScoreFilters(input = {}) {
  const range = String(input.range || '');
  const keyword = trim(input.q, 80);
  const category = trim(input.category, 40);
  const classId = trim(input.classId, 40);
  const filters = [];
  const params = [];

  if (range === 'today') filters.push("julianday(scores.created_at) >= julianday('now', 'start of day')");
  else if (range === '7d') filters.push("julianday(scores.created_at) >= julianday('now', '-7 days')");
  else if (range === '30d') filters.push("julianday(scores.created_at) >= julianday('now', '-30 days')");

  if (keyword) {
    filters.push('(COALESCE(users.display_name, scores.nickname) LIKE ? OR users.username LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (category) {
    filters.push('COALESCE(scores.category_snapshot, passages.category) = ?');
    params.push(category);
  }
  // 按班级筛选，规则与列表接口保持一致。
  if (/^\d+$/.test(classId)) {
    filters.push('EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = scores.user_id AND cm.class_id = ? AND cm.left_at IS NULL)');
    params.push(Number(classId));
  } else if (classId === 'unassigned') {
    filters.push('(users.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM class_members cm JOIN classes ON classes.id = cm.class_id WHERE cm.user_id = scores.user_id AND cm.left_at IS NULL AND classes.is_active = 1))');
  }

  return { where: filters.length ? `WHERE ${filters.join(' AND ')}` : '', params, filters };
}

const SCORE_JOINS = 'FROM scores LEFT JOIN passages ON passages.id = scores.passage_id LEFT JOIN users ON users.id = scores.user_id';

function countScoreRows(db, input) {
  const { where, params } = buildScoreFilters(input);
  return db.prepare(`SELECT COUNT(*) AS count ${SCORE_JOINS} ${where}`).get(...params).count;
}

function selectScoreRows(db, input) {
  const { where, params } = buildScoreFilters(input);
  return db.prepare(`
    SELECT scores.id, COALESCE(users.display_name, scores.nickname) AS nickname, users.username,
           COALESCE(users.student_id, '') AS studentId,
           CASE WHEN users.id IS NULL THEN '' ELSE COALESCE((SELECT classes.name FROM class_members cm JOIN classes ON classes.id = cm.class_id
             WHERE cm.user_id = users.id AND cm.left_at IS NULL AND classes.is_active = 1 ORDER BY cm.joined_at DESC LIMIT 1), '未分班') END AS className,
           scores.score, scores.accuracy, scores.wrong_chars AS wrongChars,
           scores.created_at AS createdAt, COALESCE(scores.title_snapshot, passages.title) AS passageTitle
    ${SCORE_JOINS} ${where}
    ORDER BY scores.created_at DESC
  `).all(...params);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

// scores.created_at 是 SQLite 的 CURRENT_TIMESTAMP（'2026-10-28 13:46:04' 这种字符串），
// 直接 new Date(Number(...)) 会得到 NaN 并抛 Invalid time value。
function formatStamp(value) {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value);
  if (/^\d+$/u.test(text)) return new Date(Number(text)).toISOString();
  return text;
}

function scoreRowsToCsv(rows) {
  const headers = ['姓名', '账号', '学号', '班级', '成绩', '准确率', '错字', '文章', '时间'];
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push([
      row.nickname, row.username, row.studentId, row.className, row.score, `${row.accuracy}%`, row.wrongChars,
      row.passageTitle, formatStamp(row.createdAt)
    ].map(csvCell).join(','));
  }
  return `\ufeff${lines.join('\r\n')}\r\n`;
}

module.exports = { buildScoreFilters, countScoreRows, selectScoreRows, scoreRowsToCsv, formatStamp, SCORE_JOINS };
