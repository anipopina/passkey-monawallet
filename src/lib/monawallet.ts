// Monacoin + Monaparty Wallet Module

import { HDKey } from '@scure/bip32'
import * as bip39 from '@scure/bip39'
import * as btcSigner from '@scure/btc-signer'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import * as monaparty from './monaparty'

const SATOSHI = 100_000_000
const DEFAULT_ADDRESS_PATH = "m/84'/22'/0'/0/0" // BIP84 Monacoin
const MONA_NETWORK = {
  bech32: 'mona',
  pubKeyHash: 0x32, // 50
  scriptHash: 0x37, // 55
  wif: 0xb0, // 176
} as const

export class MonaWallet {
  readonly entropy: Uint8Array // 256bit
  readonly mnemonic: string // BIP39 24words
  readonly address: string // P2WPKH
  readonly derivationPath: string
  balance = 0
  unconfBalance = 0
  utxos: Utxo[] = []

  constructor(entropy: Uint8Array, derivationPath: string = DEFAULT_ADDRESS_PATH) {
    this.entropy = new Uint8Array(entropy)
    this.mnemonic = bip39.entropyToMnemonic(this.entropy, wordlist)
    this.derivationPath = derivationPath
    const seed = bip39.mnemonicToSeedSync(this.mnemonic)
    const root = HDKey.fromMasterSeed(seed)
    const child = root.derive(this.derivationPath)
    if (!child.publicKey) throw new Error('Failed to derive public key')
    const p2wpkh = btcSigner.p2wpkh(child.publicKey, MONA_NETWORK)
    if (!p2wpkh.address) throw new Error('Failed to generate address')
    this.address = p2wpkh.address
  }

  async updateBalance(): Promise<void> {
    const result = await monaparty.getChainAddressInfo([this.address], {
      withUtxos: true,
      withLastTxnHashes: false,
    })
    if (!Array.isArray(result) || result.length === 0 || !result[0]) throw new Error('MonaWallet: balance fetch failed')
    const info = result[0]
    const monapartyUtxos = info.uxtos ?? []
    const utxos = monapartyUtxo2utxo(monapartyUtxos)
    const confirmedSat = utxos.filter((u) => u.confirmations >= 1).reduce((sum, u) => sum + u.satoshi, 0)
    const unconfSat = utxos.filter((u) => u.confirmations < 1).reduce((sum, u) => sum + u.satoshi, 0)
    this.utxos = utxos
    this.balance = confirmedSat / 100_000_000
    this.unconfBalance = unconfSat / 100_000_000
  }
}

type Utxo = {
  txid: string
  vout: number
  satoshi: number
  confirmations: number
}

function monapartyUtxo2utxo(utxos: monaparty.MonapartyUtxo[]): Utxo[] {
  return utxos.map((utxo) => {
    return {
      txid: utxo.txid,
      vout: utxo.vout,
      satoshi: Math.round(Number(utxo.amount) * SATOSHI),
      confirmations: utxo.confirmations,
    }
  })
}
