// The reset email (accounts/tokens.py) has no link yet, only two lines:
//   uid=MQ
//   token=1:abc:def
// The reset page takes them from ?uid=&token= or from the pasted email text.
// null when either part is missing.
export function parseResetCode(text) {
  const uid = String(text).match(/\buid=([\w-]+)/)?.[1]
  const token = String(text).match(/\btoken=([\w:-]+)/)?.[1]
  return uid && token ? { uid, token } : null
}
