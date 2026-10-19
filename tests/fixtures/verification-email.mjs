export function verificationLinkFromMessage(message) {
  const decoded = message.replaceAll('=\r\n', '').replaceAll('=3D', '=');
  const link = decoded.match(/http:\/\/127\.0\.0\.1:\d+\/verify-email\?token=[\w.%-]+/)?.[0];
  if (!link) throw new Error('Account fixture email contains no verification link');
  return link;
}
