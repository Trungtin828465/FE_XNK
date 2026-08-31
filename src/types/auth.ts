export interface AuthUser {
  username: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  success?: boolean;
  message?: string;
  data?: unknown;
  user?: unknown;
  token?: string;
}
