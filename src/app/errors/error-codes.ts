export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  UPSTREAM_ERROR = 'UPSTREAM_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  JIRA_NOT_CONNECTED = 'JIRA_NOT_CONNECTED',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  CSRF_INVALID = 'CSRF_INVALID',
  SIGNUP_DISABLED = 'SIGNUP_DISABLED',
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  API_KEY_INVALID = 'API_KEY_INVALID',
  HTTP_ERROR = 'HTTP_ERROR',
}

export interface ErrorDefinition {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly defaultMessage: string;
}

export const ERROR_DEFINITIONS: Readonly<Record<ErrorCode, ErrorDefinition>> = {
  [ErrorCode.VALIDATION_ERROR]: {
    code: ErrorCode.VALIDATION_ERROR,
    statusCode: 400,
    defaultMessage: 'Validation failed',
  },
  [ErrorCode.UNAUTHORIZED]: {
    code: ErrorCode.UNAUTHORIZED,
    statusCode: 401,
    defaultMessage: 'Unauthorized',
  },
  [ErrorCode.FORBIDDEN]: {
    code: ErrorCode.FORBIDDEN,
    statusCode: 403,
    defaultMessage: 'Forbidden',
  },
  [ErrorCode.NOT_FOUND]: {
    code: ErrorCode.NOT_FOUND,
    statusCode: 404,
    defaultMessage: 'Resource not found',
  },
  [ErrorCode.RATE_LIMITED]: {
    code: ErrorCode.RATE_LIMITED,
    statusCode: 429,
    defaultMessage: 'Rate limited',
  },
  [ErrorCode.UPSTREAM_ERROR]: {
    code: ErrorCode.UPSTREAM_ERROR,
    statusCode: 502,
    defaultMessage: 'Upstream service error',
  },
  [ErrorCode.INTERNAL_ERROR]: {
    code: ErrorCode.INTERNAL_ERROR,
    statusCode: 500,
    defaultMessage: 'Internal server error',
  },
  [ErrorCode.JIRA_NOT_CONNECTED]: {
    code: ErrorCode.JIRA_NOT_CONNECTED,
    statusCode: 403,
    defaultMessage: 'Jira not connected',
  },
  [ErrorCode.PROJECT_NOT_FOUND]: {
    code: ErrorCode.PROJECT_NOT_FOUND,
    statusCode: 404,
    defaultMessage: 'Project not found',
  },
  [ErrorCode.SESSION_EXPIRED]: {
    code: ErrorCode.SESSION_EXPIRED,
    statusCode: 401,
    defaultMessage: 'Session expired',
  },
  [ErrorCode.CSRF_INVALID]: {
    code: ErrorCode.CSRF_INVALID,
    statusCode: 403,
    defaultMessage: 'Invalid CSRF token',
  },
  [ErrorCode.SIGNUP_DISABLED]: {
    code: ErrorCode.SIGNUP_DISABLED,
    statusCode: 403,
    defaultMessage: 'Signup is disabled',
  },
  [ErrorCode.EMAIL_TAKEN]: {
    code: ErrorCode.EMAIL_TAKEN,
    statusCode: 400,
    defaultMessage: 'Email already registered',
  },
  [ErrorCode.INVALID_CREDENTIALS]: {
    code: ErrorCode.INVALID_CREDENTIALS,
    statusCode: 401,
    defaultMessage: 'Invalid credentials',
  },
  [ErrorCode.TOKEN_EXPIRED]: {
    code: ErrorCode.TOKEN_EXPIRED,
    statusCode: 401,
    defaultMessage: 'Token expired',
  },
  [ErrorCode.PERMISSION_DENIED]: {
    code: ErrorCode.PERMISSION_DENIED,
    statusCode: 403,
    defaultMessage: 'Permission denied',
  },
  [ErrorCode.API_KEY_REVOKED]: {
    code: ErrorCode.API_KEY_REVOKED,
    statusCode: 401,
    defaultMessage: 'API key revoked',
  },
  [ErrorCode.API_KEY_INVALID]: {
    code: ErrorCode.API_KEY_INVALID,
    statusCode: 401,
    defaultMessage: 'Invalid API key',
  },
  [ErrorCode.HTTP_ERROR]: {
    code: ErrorCode.HTTP_ERROR,
    statusCode: 500,
    defaultMessage: 'HTTP error',
  },
} as const;

export function getErrorDefinition(code: ErrorCode): ErrorDefinition {
  // eslint-disable-next-line security/detect-object-injection -- code is a typed ErrorCode enum member indexing a fixed record
  return ERROR_DEFINITIONS[code];
}
