// Passkey Module

export async function createPasskey(rpId: string, rpName: string, username: string): Promise<{ credential: PublicKeyCredential }> {
  const pubkeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: randomBytes(32),
    rp: { id: rpId, name: rpName },
    user: { id: randomBytes(32), name: username, displayName: username },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    attestation: 'none',
    extensions: { prf: {} },
  }
  const credential = await navigator.credentials.create({ publicKey: pubkeyOptions })
  if (!credential) throw new Error('Passkey registration failed')
  if (!(credential instanceof PublicKeyCredential)) throw new Error(`Unexpected credential type: ${credential.type}`)
  return { credential }
}

export async function hashWithPasskey(rpId: string, message: string): Promise<{ credential: PublicKeyCredential; prfOutput: Uint8Array }> {
  const salt = await messageToSalt(message)
  const pubkeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: randomBytes(32), // ウォレットで認証するのでチャレンジは適当で良い
    rpId: rpId,
    userVerification: 'required',
    extensions: {
      prf: {
        eval: { first: salt.buffer },
      },
    },
  }
  const credential = await navigator.credentials.get({ publicKey: pubkeyOptions })
  if (!credential) throw new Error('Passkey authentication failed')
  if (!(credential instanceof PublicKeyCredential)) throw new Error(`Unexpected credential type: ${credential.type}`)

  const credExtensions = credential.getClientExtensionResults()
  const prfResults = credExtensions.prf?.results
  if (!prfResults || !prfResults.first)
    throw new Error(
      'Your authenticator or browser may not support WebAuthn PRF, which is required for wallet generation. Please try using a different authenticator or browser.',
    )

  const prfOutput = bufferSourceToBytes(prfResults.first)
  return { credential, prfOutput }
}

const messageToSalt = async (message: string) => {
  const data = new TextEncoder().encode(message)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(digest)
}

const randomBytes = (len = 32) => {
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  return buf
}

const bufferSourceToBytes = (source: BufferSource): Uint8Array => {
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  else return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
}
