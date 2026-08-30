import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

function mark(size) {
  const r = Math.round(size * 0.22)
  const barW = Math.round(size * 0.42)
  const barH = Math.round(size * 0.11)
  const x = Math.round((size - barW) / 2)
  const y = Math.round((size - barH) / 2)
  const barR = Math.round(barH / 2)
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${r}" fill="#0b0b0c"/>
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${barR}" fill="#d4a853"/>
    </svg>`,
  )
}

await mkdir(publicDir, { recursive: true })
await sharp(mark(192)).png().toFile(join(publicDir, 'icon-192.png'))
await sharp(mark(512)).png().toFile(join(publicDir, 'icon-512.png'))
await sharp(mark(32)).png().toFile(join(publicDir, 'favicon.png'))
await sharp(mark(180)).png().toFile(join(publicDir, 'apple-touch-icon.png'))
console.log('Wrote public/icon-192.png, icon-512.png, favicon.png, apple-touch-icon.png')
