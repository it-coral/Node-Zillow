/**
 * Get reports from specified agencies
 */

let fs = require('fs')
let Rx = require('rx')
let moment = require('moment')

let createRequestObservable = require('./utils/request-observable')
let fixedEncodeURIComponent = require('./utils/encode-uri-component')
let generateRings = require('./utils/generate-rings')
let crimeTypes = require('./utils/crime-types')

const DATE_FORMAT = 'YYYYMMDD'
const ZOOM_PARAMS = [3000, 5000, 7000, 10000, 15000, 20000, 30000]

let selectedCategories = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15']
let selectedCategoriesString = selectedCategories.map(c => `"${c}"`).join()

let commonPostHeaders = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }

let writeFile = Rx.Observable.fromNodeCallback(fs.writeFile)

let parseStartupPoint = body => {
  
  let result = /sv": {([^}]*)}/.exec(body)
  if (!result || !result[1]) throw new Error('Something went wrong when detecting startup coordinates')

  return JSON.parse(`{${result[1]}}`)
}

let getDumpName = params => `${params.agencyId}_${params.startDate}-${params.endDate}.json`

let dumpToFile = (reports, filename) => Rx.Observable
  .just(reports)
  .map(JSON.stringify)
  .flatMap(json => writeFile(filename, json))

let getVariousStartupRings = agencyId => Rx.Observable
  .just(1)
  .flatMap(() => createRequestObservable({
    url: `http://www.crimemapping.com/map/agency/${agencyId}`,
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:51.0) Gecko/20100101 Firefox/51.0'
    }
  }))
  .map(body => parseStartupPoint(body))
  .flatMap(startupPoint => Rx.Observable
    .from(ZOOM_PARAMS)
    .map(offset => generateRings(startupPoint, offset, offset)))

/**
 * Here we have an object {reports: [], rings: ''}
 * So we need to send reports array back with coords property filled
 */
let extendReportsWithGeo = (params, data) => Rx.Observable
  .just(1)
  .do(console.log(`Extending reports for agency id #${params.agencyId} with coordinates..`))
  .flatMap(() => createRequestObservable({
    method: 'POST',
    url: 'https://www.crimemapping.com/map/MapUpdated',
    body: fixedEncodeURIComponent(`filterdata={"SelectedCategories":[${selectedCategoriesString}],"SpatialFilter":{"FilterType":2,"Filter":"{\\"rings\\":${data.rings},\\"spatialReference\\":{\\"wkid\\":102100}}"},"TemporalFilter":{"FilterType":"Previous","ExplicitStartDate":"${params.startDate}","ExplicitEndDate":"${params.endDate}"},"AgencyFilter":[${params.agencyId}]}`),
    headers: commonPostHeaders
  }))
  .map(JSON.parse)
  .map(data => ((data.result || {}).rs || []))
  /**
   * Here we have array with coordinates in format like [{x: '', y: '', l: '', i: [ids]}]
   */
  .map(geoArray => {
    let reports = data.reports
    geoArray.forEach(geoItem => {
      geoItem.i.forEach(itemId => {
        let report = reports.find(r => r.id === itemId) || {}
        report.coords = { x: geoItem.x, y: geoItem.y, l: geoItem.l }
      })
    })
    return reports
  })

let getReports = (params, rings) => Rx.Observable
  .just(1)
  .flatMap(url => createRequestObservable({
    method: 'POST',
    url: 'https://www.crimemapping.com/Map/CrimeIncidents_Read?' + fixedEncodeURIComponent(`paramFilt={"SelectedCategories":[${selectedCategoriesString}],"SpatialFilter":{"FilterType":2,"Filter":"{\\"rings\\":${rings},\\"spatialReference\\":{\\"wkid\\":102100}}"},"TemporalFilter":{"FilterType":"Previous","ExplicitStartDate":"${params.startDate}","ExplicitEndDate":"${params.endDate}"},"AgencyFilter":[${params.agencyId}]}&unmappableOrgIDs=System.Collections.Generic.List\`1[System.Int32]`),    
    headers: commonPostHeaders
  }))
  .map(JSON.parse)
  .map(d => d.Data)
  .flatMap(_ => _)
  .map(incident => {
    let typeRegExpResult = /\/([\d]*)\.svg/.exec(incident.Type)
    let type = null
    if (typeRegExpResult) type = (crimeTypes.find(c => c.id === parseInt(typeRegExpResult[1])) || {})

    let id = (/'(.*)'/.exec(incident.MapIt) || [])[1] || null

    return {
      id: id,
      incidentNum: incident.IncidentNum,
      typeId: type.id,
      typeName: type.value,
      description: incident.Description,
      location: incident.Location,
      date: new Date(moment(incident.Date, 'YYYYMMDDHHmm')).toISOString(),
      agency: incident.Agency
    }
  })
  .toArray()
  .map(reports => {
    return { reports: reports, rings: rings }
  })

let dumpAgencyReports = params => Rx.Observable
  .just(1)
  .flatMap(() => Rx.Observable.just(1)
    .flatMap(() => getVariousStartupRings(params.agencyId))
    .flatMap(rings => getReports(params, rings))
    .catch(e => {
      console.log('caught', e, 'when crawling', '#' + params.agencyId)
      return Rx.Observable.just(null)
    })
  )
  .filter(_ => _)
  .toArray()
  .filter(_ => _.length !== 0)
  // here we have various reports by zoom settings, lets get most appropriate one (with bigger incidents count)
  .map(reportsArray => reportsArray.sort((a, b) => b.reports.length - a.reports.length))
  .map(reportsArray => reportsArray[0])
  .do(data => console.log('receieved', data.reports.length, 'incidents'))
  .flatMap(data => extendReportsWithGeo(params, data))
  .flatMap(reports => {
    console.log("Params=", params);
    console.log(JSON.stringify(reports));
    let filename = `dumps/${getDumpName(params)}`
    return dumpToFile(reports, filename).do(console.log(`dumped to ${filename}`))
  })

let start = () => {
  let possibleDates = []
  let agenciesToBeDumped = process.argv.splice(2)


  agenciesToBeDumped = agenciesToBeDumped.map(a => {
    if (parseInt(a) > 20000000) {
      possibleDates.push(a)
      return null
    }
    return a
  }).filter(_ => _)

  let startDate = (possibleDates[0] ? moment(possibleDates[0]) : moment().subtract(7, 'days')).format(DATE_FORMAT)
  let endDate = moment(possibleDates[1]).format(DATE_FORMAT)

  if (!agenciesToBeDumped.length) {
    console.error('No ids provided in arguments\nTry \'node dump-agency-reports.js 17 182\'')
    process.exit()
  }

  Rx.Observable
    .from(agenciesToBeDumped)
    .map(agencyId => {
      return {agencyId: agencyId, startDate: startDate, endDate: endDate}
    })
    .do(console.log)
    .do(params => console.log(`getting reports for: http://www.crimemapping.com/map/agency/${params.agencyId}`))
    .flatMapWithMaxConcurrent(2, params => dumpAgencyReports(params))
    .doOnError(console.error)
    .subscribe()
}

start()
