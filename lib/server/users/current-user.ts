import "server-only";

import { getPrismaClient } from "@/lib/server/db/prisma";

const developmentUserId = "local-demo-user";

export type CurrentUser = {
  id: string;
};

// Authentication is not wired yet; keep all private data scoped to one explicit dev user.
export async function getCurrentUser(): Promise<CurrentUser> {
  const prisma = getPrismaClient();
  const user = await prisma.user.upsert({
    where: { id: developmentUserId },
    update: {},
    create: {
      id: developmentUserId,
      displayName: "FitMate 用户",
      identities: {
        create: {
          provider: "anonymous",
          providerAccountId: developmentUserId,
        },
      },
    },
    select: { id: true },
  });

  return user;
}
