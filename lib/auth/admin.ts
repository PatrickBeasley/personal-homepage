export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    return false;
  }

  return email.toLowerCase() === adminEmail.toLowerCase();
}