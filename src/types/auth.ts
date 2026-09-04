export interface AuthUser {
  id?: number;
  username: string;
  name: string;
  role: string;
  session?: string;
  token?: string;
}

export interface LoginResponse {
  success?: boolean;
  message?: string;
  data?: unknown;
  user?: unknown;
  token?: string;
  accessToken?: string;
  access_token?: string;
  session?: string;
  sessionId?: string;
  session_id?: string;
}
