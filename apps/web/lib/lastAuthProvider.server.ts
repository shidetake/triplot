import { cookies } from "next/headers";

import {
  isAuthProvider,
  LAST_AUTH_PROVIDER_COOKIE,
  type AuthProvider,
} from "./lastAuthProvider";

/** Cookie から前回サインインしたプロバイダを解決する（Server Component 専用）。 */
export async function resolveLastAuthProvider(): Promise<AuthProvider | null> {
  const v = (await cookies()).get(LAST_AUTH_PROVIDER_COOKIE)?.value;
  return isAuthProvider(v) ? v : null;
}
