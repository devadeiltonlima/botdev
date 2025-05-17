const sharp = require('sharp');
const path = require('path');
const fs = require('fs-extra');

async function convertWebpToPng(webpPath, tempDir) {
    const pngPath = path.join(tempDir, `converted_${Date.now()}.png`);
    await sharp(webpPath)
        .toFormat('png')
        .toFile(pngPath);
    return pngPath;
}

module.exports = {
    convertWebpToPng
};
