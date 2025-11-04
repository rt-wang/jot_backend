/**
 * Problem+JSON error response utilities
 * https://datatracker.ietf.org/doc/html/rfc7807
 */

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail: string,
    public type: string = 'about:blank'
  ) {
    super(detail);
    this.name = 'ApiError';
  }

  toProblemDetail(): ProblemDetail {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
    };
  }

  toResponse(): Response {
    return new Response(JSON.stringify(this.toProblemDetail()), {
      status: this.status,
      headers: {
        'Content-Type': 'application/problem+json',
      },
    });
  }
}

export class ValidationError extends ApiError {
  constructor(detail: string) {
    super(400, 'Bad Request', detail);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(detail: string = 'Authentication required') {
    super(401, 'Unauthorized', detail);
  }
}

export class ForbiddenError extends ApiError {
  constructor(detail: string = 'Access forbidden') {
    super(403, 'Forbidden', detail);
  }
}

export class NotFoundError extends ApiError {
  constructor(detail: string = 'Resource not found') {
    super(404, 'Not Found', detail);
  }
}

export class RateLimitError extends ApiError {
  constructor(detail: string = 'Rate limit exceeded') {
    super(429, 'Too Many Requests', detail);
  }
}

export class InternalServerError extends ApiError {
  constructor(detail: string = 'Internal server error') {
    super(500, 'Internal Server Error', detail);
  }
}

/**
 * Convert any error to an ApiError response
 */
export function errorToResponse(error: unknown, requestId?: string): Response {
  console.error('[error]', { requestId, error });

  if (error instanceof ApiError) {
    return error.toResponse();
  }

  // Generic error
  const apiError = new InternalServerError('An unexpected error occurred');
  return apiError.toResponse();
}

