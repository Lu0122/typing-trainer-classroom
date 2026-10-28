const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEY_LENGTH = 64;

function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeDisplayName(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function validateUsername(username) {
  if (!/^[a-z0-9][a-z0-9_-]{3,23}$/i.test(username)) {
    return '学号或用户名需为 4 至 24 位字母、数字、下划线或短横线';
  }
  return null;
}

function validateDisplayName(value) {
  const displayName = normalizeDisplayName(value);
  const length = Array.from(displayName).length;
  if (length < 2 || length > 12) return '姓名或昵称需为 2 至 12 个字符';
  if (!/^[\p{L}\p{N}·._-]+$/u.test(displayName)) return '姓名或昵称只能包含文字、数字、点、下划线或短横线';
  const sensitiveNameTerms = [
    '管理员', '系统', '官方', '客服', '老师', '校长', '院长',
    '共产党', '习近平', '毛泽东', '邓小平', '法轮功', '台独', '港独', '藏独', '疆独',
    '赌博', '博彩', '色情', '淫秽', '毒品', '诈骗', '骗子', '傻逼', '操你', '妈的',
    'admin', 'administrator', 'fuck', 'sex'
  ];
  const foldedName = displayName.toLowerCase();
  if (sensitiveNameTerms.some((term) => foldedName.includes(term.toLowerCase()))) return '姓名包含违规或敏感词，请换一个姓名';
  return null;
}

function validatePassword(password) {
  const value = String(password ?? '');
  if (!/^[A-Za-z0-9]{6,12}$/.test(value)) return '密码需为 6 至 12 位，只能使用字母和数字';
  if (!/^\d+$/.test(value) && !/(?=.*[A-Za-z])(?=.*\d)/.test(value)) return '密码需为纯数字，或同时包含字母和数字';
  return null;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(password), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

async function verifyPassword(password, record) {
  try {
    const [algorithm, n, r, p, saltHex, hashHex] = String(record).split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    if (expected.length !== KEY_LENGTH) return false;
    const actual = Buffer.from(await scrypt(String(password), Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 32 * 1024 * 1024
    }));
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

const fakeSalt = Buffer.alloc(16, 7);
const fakeHash = crypto.scryptSync('not-a-real-password-123', fakeSalt, KEY_LENGTH, SCRYPT_OPTIONS);
const FAKE_PASSWORD_RECORD = `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${fakeSalt.toString('hex')}$${fakeHash.toString('hex')}`;

module.exports = {
  FAKE_PASSWORD_RECORD,
  createSessionToken,
  hashPassword,
  hashPasswordSync,
  hashSessionToken,
  normalizeDisplayName,
  normalizeUsername,
  validateDisplayName,
  validatePassword,
  validateUsername,
  verifyPassword
};
