/**
 * Here we generating request parameter called "rings" that is responsible for zoom level
 */

const STARTUP_X_DEVIATION = 10000
const STARTUP_Y_DEVIATION = 10000

module.exports = (startupPoint, xDev, yDev) => {
  xDev = xDev || STARTUP_X_DEVIATION
  yDev = yDev || STARTUP_Y_DEVIATION

  let rings = [
    `[${startupPoint.x - xDev}, ${startupPoint.y - yDev}]`,
    `[${startupPoint.x - xDev}, ${startupPoint.y + yDev}]`,
    `[${startupPoint.x + xDev}, ${startupPoint.y + yDev}]`,
    `[${startupPoint.x + xDev}, ${startupPoint.y - yDev}]`,
    `[${startupPoint.x - xDev}, ${startupPoint.y - yDev}]`
  ]

  return `[[${rings.join()}]]`
}
