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

    console.log('')
    console.log('================================')
    console.log('HJ GROUPS LOGO CREATED')
    console.log('================================')
    console.log(`Output: ${output}`)
    console.log('')
  } catch (error) {
    console.error('')
    console.error('LOGO PROCESSING ERROR')
    console.error(error)
  }
}

processLogo()
