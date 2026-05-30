export const serializeUser = (user) => {
  const u = user?.toJSON ? user.toJSON() : { ...user };
  u.is_admin = Boolean(u.is_admin);
  u.terminate = u.terminate === true || u.terminate === 1 || u.terminate === "1";
  if (u.userRole) {
    let perms = u.userRole.permissions;
    if (typeof perms === "string") {
      try {
        perms = JSON.parse(perms);
      } catch {
        perms = [];
      }
    }
    u.userRole.permissions = Array.isArray(perms) ? perms : [];
  }
  return u;
};