import type { UserRole } from "@dz/db";

// Augment Auth.js types so the session carries { userId, organizationId, role } (M1-01, CR-20).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: UserRole;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }

  interface User {
    organizationId: string;
    role: UserRole;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    organizationId: string;
    role: UserRole;
  }
}
