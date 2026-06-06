export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type AuthPayload = {
  userId: string;
  email: string;
  role: string;
};
