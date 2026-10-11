export function paginate(items, requestedPage, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const numericPage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  const page = Math.min(Math.max(1, numericPage), totalPages);
  const start = (page - 1) * pageSize;
  return {
    rows: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages
  };
}
