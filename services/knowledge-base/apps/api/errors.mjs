export class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function fail(status, code, message, details) {
  throw new ApiError(status, code, message, details);
}

export function handleError(error, request, reply) {
  if (error instanceof ApiError) {
    return reply.code(error.statusCode).send({ error: {
      code: error.code, message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    } });
  }
  // SQLite extended codes retain the primary code in the low byte.
  if ([5, 6].includes((error.errcode ?? 0) & 255)) {
    return reply.code(503).header('Retry-After', '1').send({ error: {
      code: 'DATABASE_BUSY', message: '数据库正在处理其他写入，请使用相同请求键重试。',
    } });
  }
  if (error.statusCode >= 400 && error.statusCode < 500) {
    const status = error.statusCode;
    return reply.code(status).send({ error: {
      code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST',
      message: status === 413 ? '请求内容超过允许大小。' : '请求格式不正确。',
    } });
  }
  // Do not echo SQLite statements, request bodies, filesystem paths or stacks.
  request.log.error({ code: error.code ?? 'INTERNAL_ERROR' }, 'API operation failed');
  return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: '保存或读取失败，请稍后重试。' } });
}
