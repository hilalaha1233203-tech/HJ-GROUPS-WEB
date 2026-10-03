export function isHjAdminUser(user) {
  return user?.app_metadata?.role === 'admin'
}
