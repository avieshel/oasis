import { ErrorCode, getErrorDefinition } from './error-codes';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly fields?: Record<string, string>;
  readonly detail?: string;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    options?: {
      fields?: Record<string, string>;
      detail?: string;
      meta?: Record<string, unknown>;
      message?: string;
    },
  ) {
    const def = getErrorDefinition(code);
    super(options?.message ?? def.defaultMessage);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = def.statusCode;
    this.fields = options?.fields;
    this.detail = options?.detail;
    this.meta = options?.meta;
  }
}

export class ValidationError extends AppError {
  constructor(fields: Record<string, string>, detail?: string) {
    super(ErrorCode.VALIDATION_ERROR, { fields, detail });
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail?: string) {
    super(ErrorCode.UNAUTHORIZED, { detail });
  }
}

export class ForbiddenError extends AppError {
  constructor(detail?: string) {
    super(ErrorCode.FORBIDDEN, { detail });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, detail?: string) {
    super(ErrorCode.NOT_FOUND, { detail: detail ?? `${resource} not found` });
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfter: number, detail?: string) {
    super(ErrorCode.RATE_LIMITED, { meta: { retryAfter }, detail });
  }
}

export class UpstreamError extends AppError {
  constructor(detail: string) {
    super(ErrorCode.UPSTREAM_ERROR, { detail });
  }
}

export class InternalError extends AppError {
  constructor(detail?: string) {
    super(ErrorCode.INTERNAL_ERROR, { detail });
  }
}

export class JiraNotConnectedError extends AppError {
  constructor() {
    super(ErrorCode.JIRA_NOT_CONNECTED);
  }
}

export class ProjectNotFoundError extends AppError {
  constructor(projectKey: string) {
    super(ErrorCode.PROJECT_NOT_FOUND, {
      detail: `Project ${projectKey} not found`,
    });
  }
}

export class SessionExpiredError extends AppError {
  constructor() {
    super(ErrorCode.SESSION_EXPIRED);
  }
}

export class CsrfInvalidError extends AppError {
  constructor() {
    super(ErrorCode.CSRF_INVALID);
  }
}

export class SignupDisabledError extends AppError {
  constructor() {
    super(ErrorCode.SIGNUP_DISABLED);
  }
}

export class EmailTakenError extends AppError {
  constructor() {
    super(ErrorCode.EMAIL_TAKEN);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super(ErrorCode.INVALID_CREDENTIALS);
  }
}

export class TokenExpiredError extends AppError {
  constructor() {
    super(ErrorCode.TOKEN_EXPIRED);
  }
}

export class PermissionDeniedError extends AppError {
  constructor(detail?: string) {
    super(ErrorCode.PERMISSION_DENIED, { detail });
  }
}

export class ApiKeyRevokedError extends AppError {
  constructor() {
    super(ErrorCode.API_KEY_REVOKED);
  }
}

export class ApiKeyInvalidError extends AppError {
  constructor() {
    super(ErrorCode.API_KEY_INVALID);
  }
}

export class ApiKeyProjectForbiddenError extends AppError {
  constructor(projectKey: string) {
    super(ErrorCode.API_KEY_PROJECT_FORBIDDEN, {
      detail: `Project ${projectKey} is not allowed for this API key`,
    });
  }
}
