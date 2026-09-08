export function selectOverlayMode({ documentPip, videoPip }) {
  if (documentPip) return 'document';
  if (videoPip) return 'video';
  return 'unsupported';
}
