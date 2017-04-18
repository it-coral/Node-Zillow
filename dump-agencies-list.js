/**
 * Get list of available agencies
 */

let fs = require('fs')
let Rx = require('rx')
let Table = require('tty-table')

let createRequestObservable = require('./utils/request-observable')

const DUMP_PATH = 'dumps/agencies.json'

const tableHeader = [{
  value: 'districtId'
}, {
  value: 'districtName'
}, {
  value: 'agencyId'
}, {
  value: 'agencyName'
}]

let writeFile = Rx.Observable.fromNodeCallback(fs.writeFile)

let getDistricts = Rx.Observable
  .just(1)
  .flatMap(() => createRequestObservable({
    url: 'http://www.crimemapping.com/'
  }))
  .map(body => {
    let result = /Landing\.PoliticalBoundaryChanged,"dataSource":\[([\s\S]*)\],/.exec(body)
    if (!result || !result[1]) throw new Error('Something happened with districts parsing')
    return JSON.parse(`[${result[1]}]`)
  })

let extendDistrictWithAgencies = district => Rx.Observable
  .just(1)
  .flatMap(() => createRequestObservable({
    url: `http://www.crimemapping.com/home/GetAgencies?boundaryid=${district.id}`
  }))
  .map(body => {
    let result = /AgencyTextChanged,"dataSource":\[(.*)\],"d/.exec(body)
    if (!result || !result[1]) throw new Error('Something happened with agencies parsing for district', district.id)
    return JSON.parse(`[${result[1]}]`)
  })
  .flatMap(_ => _)
  .map(agency => {
    return {
      id: agency.ID,
      name: agency.Name
    }
  })
  .toArray()
  .do(agencies => {
    district.agencies = agencies || []
  })
  .map(() => district)

let getDistrictsWithAgencies = () => Rx.Observable
  .just(1)
  .flatMap(() => getDistricts)
  .flatMap(_ => _)
  .map(item => {
    return {
      id: item.ID,
      name: item.Name
    }
  })
  .flatMapWithMaxConcurrent(20, district => extendDistrictWithAgencies(district))

let transformDistrictIntoTableLines = district => {
  let lines = []
  district.agencies.forEach(agency => {
    lines.push([district.id, district.name, agency.id, agency.name])
  })
  return lines
}

let showTable = rows => Rx.Observable.just(console.log(Table(tableHeader, rows).render()))

let dumpToFile = rows => Rx.Observable
  .just(rows)
  .flatMap(_ => _)
  .map(row => {
    let item = {}
    row.forEach((value, index) => {
      item[tableHeader[index].value] = value
    })
    return item
  })
  .toArray()
  .map(JSON.stringify)
  .flatMap(output => writeFile(DUMP_PATH, output))

Rx.Observable.just(1)
  .flatMap(() => getDistrictsWithAgencies())
  .map(district => transformDistrictIntoTableLines(district))
  .flatMap(_ => _)
  .toArray()
  .map(rows => rows.sort((a, b) => {
    let sortResult = a[0] - b[0]
    if (sortResult === 0) sortResult = a[2] - b[2]
    return sortResult
  }))
  .flatMap(rows => Rx.Observable.forkJoin([
    showTable(rows),
    dumpToFile(rows).do(console.log(`Dumped into ${DUMP_PATH}`))
  ]))
  .doOnError(err => console.error('Error occured:', err))
  .subscribe()
