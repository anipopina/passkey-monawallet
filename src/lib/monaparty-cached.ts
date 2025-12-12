// cached version of monaparty functions

import * as monaparty from './monaparty'

export const assetInfoCache = new Map<string, monaparty.AssetInfo>()

export async function getAssetInfo(assets: string[]): Promise<monaparty.AssetInfo[]> {
  const noCacheAssets = assets.filter((asset) => !assetInfoCache.has(asset))
  if (noCacheAssets.length > 0) {
    const infos = await monaparty.getAssetInfo(noCacheAssets)
    for (const info of infos) assetInfoCache.set(info.asset, info)
  }
  return assets.map((asset) => assetInfoCache.get(asset)!)
}
