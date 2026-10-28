// 后台列表统一分页。
//
// 约定：所有列表接口都返回 { rows, total, page, pageSize, pages }。
// - pageSize 限制在 10–50，默认 20（不传就用 20）；
// - page 越界自动夹到 1..pages，所以前端不用自己算边界。

function listPage(query = {}, total = 0) {
  const pageSize = Math.min(50, Math.max(10, Number.parseInt(query.pageSize, 10) || 20));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.page, 10) || 1));
  return { page, pageSize, pages, offset: (page - 1) * pageSize };
}

module.exports = { listPage };
