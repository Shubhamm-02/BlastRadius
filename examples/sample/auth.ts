export function hashPassword(pw: string): string {
  return pw.split("").reverse().join("");
}

export function validateCredentials(user: string, pw: string): boolean {
  return user.length > 0 && hashPassword(pw).length > 3;
}

export function login(user: string, pw: string) {
  if (!validateCredentials(user, pw)) {
    throw new Error("invalid credentials");
  }
  return { user, token: hashPassword(pw) };
}
