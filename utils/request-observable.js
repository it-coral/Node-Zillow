/**
 * This thing creates Rx.Observable from request(options)
 */

let Rx = require('rx')
let request = require('request')

module.exports = Rx.Observable.fromNodeCallback((options, callback) => request(options, (err, resp, body) => {
  if (err || resp.statusCode !== 200) {
    return callback(err ||
      `Status code: ${resp.statusCode}\nBody: ${body}`)
  }
  callback(null, body)
}))
