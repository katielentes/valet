export type AuthLocation = {
  id: string;
  name: string;
  identifier: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  location: AuthLocation | null;
};

export type AuthTenant = {
  id: string;
  name: string;
  slug: string;
};

export type SessionPayload = {
  user: AuthUser;
  tenant: AuthTenant;
  expiresAt: string;
};

async function parseJSON(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("Failed to parse JSON response", error);
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const response = await fetch("/api/auth/session", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const data = await parseJSON(response);
    throw new Error(data?.error ?? "Unable to load session");
  }

  const data = (await parseJSON(response)) as SessionPayload | null;
  return data;
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<SessionPayload> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  const data = await parseJSON(response);

  if (!response.ok) {
    throw new Error(data?.error ?? "Login failed");
  }

  return data as SessionPayload;
}

export async function logoutUser(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok && response.status !== 204) {
    const data = await parseJSON(response);
    throw new Error(data?.error ?? "Logout failed");
  }
}

