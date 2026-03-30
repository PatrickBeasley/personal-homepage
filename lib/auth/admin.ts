import { getAdminEmail } from "@/lib/env";

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return email.toLowerCase() === getAdminEmail().toLowerCase();
}