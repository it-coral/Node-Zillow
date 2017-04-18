// HACK: Website uses strange url encoding, so we need to fix our standard function
module.exports = (str) => encodeURIComponent(str).replace(/%7D/g, '}').replace(/%3D/g, '=').replace(/%26/g, '&')
