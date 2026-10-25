export function allowed(
  email: string | null | undefined,
  configured: string | undefined,
) {
  return (
    !!configured && !!email && email.toLowerCase() === configured.toLowerCase()
  );
}
