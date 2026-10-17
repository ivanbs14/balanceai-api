export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  googleLinked: boolean;
};

export const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  googleSub: true,
} as const;

export function toAuthUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  googleSub: string | null;
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    googleLinked: Boolean(user.googleSub),
  };
}

export type AuthPayload = {
  userId: string;
  email: string;
  role: string;
};
