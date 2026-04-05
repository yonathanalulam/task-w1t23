const MIN_PASSWORD_LENGTH = 10;
const UPPERCASE_REGEX = /[A-Z]/;
const LOWERCASE_REGEX = /[a-z]/;
const NUMBER_REGEX = /\d/;
const SYMBOL_REGEX = /[^A-Za-z0-9]/;

export interface PasswordPolicyResult {
  ok: boolean;
  errors: string[];
}

export const passwordPolicyDescription = {
  minLength: MIN_PASSWORD_LENGTH,
  requiresUppercase: true,
  requiresLowercase: true,
  requiresNumber: true,
  requiresSymbol: true
} as const;

export const validatePasswordPolicy = (password: string): PasswordPolicyResult => {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  if (!UPPERCASE_REGEX.test(password)) {
    errors.push('Password must include at least one uppercase letter.');
  }

  if (!LOWERCASE_REGEX.test(password)) {
    errors.push('Password must include at least one lowercase letter.');
  }

  if (!NUMBER_REGEX.test(password)) {
    errors.push('Password must include at least one number.');
  }

  if (!SYMBOL_REGEX.test(password)) {
    errors.push('Password must include at least one symbol.');
  }

  return {
    ok: errors.length === 0,
    errors
  };
};
