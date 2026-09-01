const sharp = require('sharp')

const input = 'public/hj-groups-logo-original.png'
const output = 'public/hj-groups-logo.png'

async function processLogo() {
  try {
    await sharp(input)
      .ensureAlpha()
      .trim()
      .png()
      .toFile(output)

    console.log('HJ GROUPS logo created successfully!')
    console.log('Output:', output)
  } catch (error) {
    console.error('Logo processing failed:')
    console.error(error)
  }
}

processLogo()