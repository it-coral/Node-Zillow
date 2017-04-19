EdgeApi    = require 'edgeapi'
newPromise = require 'newpromise'
config     = require 'edgecommonconfig'
moment     = require 'moment'
{spawn}    = require 'child_process'
fs         = require 'fs'
argv       = require('yargs').argv

Days          = 2
Offset        = 0
NorthCarolina =
path          = "./"

allNames =
    "NorthCarolina" : [ 65, 137, 144, 157, 162, 167, 385, 413 ]
    "SouthCarolina" : [ 196, 260 ]
    "Florida1"      : [ 3, 23, 49, 90, 94, 99, 109, 126, 158 ]
    "Florida2"      : [ 163, 164, 174, 177, 187, 203, 219, 222, 227 ]
    "Florida3"      : [ 232, 233, 251, 256, 267, 274, 276, 279, 281 ]
    "Florida4"      : [ 291, 297, 333, 345, 346, 354, 393, 394 ]
    "Texas"         : [ 128, 184, 231, 234, 375 ]
    "Georgia"       : [ 76, 83, 93, 149, 317, 52 ]

MercatorToLatLon = (mercX, mercY) ->
    rMajor = 6378137  ## Equatorial Radius for WGS84
    shift  = Math.PI * rMajor

    lon = (mercX / shift) * 180.0
    lat = (mercY / shift) * 180.0
    lat = (180.0 / Math.PI) * (2 * Math.atan(Math.exp(lat * Math.PI / 180.0)) - (Math.PI / 2.0))

    return [ lon, lat ]

##|
##|  Scan the output and pull out the rest resulting objects
##|
processOutput = (output)->

    EdgeApi.doGetApi()
    .then (api)->
        reBad      = new RegExp "-", "g"
        all        = []
        crimeStats = {}
        crimeType  = {}
        total      = 0

        for str in output.split(/\n/)
            if !/"id":/.test str then continue

            try

                records = JSON.parse(str)
                for rec in records

                    newData =
                        agency_name   : rec.agency
                        case_number   : rec.incidentNum
                        crime_code    : rec.typeName
                        date_reported : new Date(rec.date)
                        description   : rec.description
                        location      : rec.location
                        object_id     : rec.id
                        x             : rec.coords.x
                        y             : rec.coords.y
                        id            : rec.id.replace reBad, "_"
                        loc :
                            type        : "Point"
                            coordinates : MercatorToLatLon(rec.coords.x, rec.coords.y)

                    api.data_doUpdatePath "community", "/crime/#{newData.id}", newData
                    total++

                    if !crimeStats[rec.agency]?
                        crimeStats[rec.agency] = 0

                    if !crimeType[rec.typeName]?
                        crimeType[rec.typeName] = 0

                    crimeStats[rec.agency]++
                    crimeType[rec.typeName]++

            catch e
                console.log "Exception:", e

            ##|
            ##|  Add stats for this import
            api.stats_doAddStatsMany "today", "CrimeAgency", crimeStats
            api.stats_doAddStatsMany "today", "CrimeType", crimeType

        api.doCompletePending()
        .then ()->
            console.log "Results=", total
            process.exit(0)

usage = ()->

    console.log "Usage: run_update.coffee "
    console.log "  -n <Name> (", Object.keys(allNames).join(","), ")"
    console.log "  -d <days> [optional number of days]"
    console.log "  -o <offset> [optional number of days in the past]"
    process.exit(0)


runStats = ()->

    EdgeApi.doGetApi()
    .then (api)->

        aggCondition = [
            "$group" :
                "_id" :
                    year   : {$year       : "$date_reported"}
                    month  : {$month      : "$date_reported"}
                    day    : {$dayOfMonth : "$date_reported"}
                    agency : "$agency_name"
                "count" :
                    "$sum" : 1
        ]

        console.log "AGG:", JSON.stringify(aggCondition)
        api.data_doAggregate "community", "/crime", aggCondition
        .then (result)->

            console.log "Stats=", result
            process.exit(0)


try

    if argv.stats?

        runStats()

    else

        if argv.d?
            Days = argv.d

        if argv.o?
            Offset = argv.o

        now = new Date() - (1000 * 86400 * (Days+1)) - (86400 * 1000 * Offset)
        end = now + (86400 * 1000 * Days)

        if !argv.n?
            console.log "A=", argv
            usage()

        if !allNames[argv.n]?
            console.log "Unknown region:", argv.n
            usage()

        args = [ "./dump-agency-reports.js" ]
        args.push id for id in allNames[argv.n]
        args.push moment(now).format("YYYYMMDD")
        args.push moment(end).format("YYYYMMDD")

        console.log "ARGS:", args

        fullOutput = ""

        ##|  Spawn the job
        envCopy =
            TERM    : "HTML"
            HOME    : "/Users/innovation"
            LANG    : "en_US.UTF-8"
            LOGNAME : "innovation"
            PATH    : "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
            SHELL   : "/bin/bash"
            SHLVL   : "1"
            TMPDIR  : "/tmp/"
            USER    : "innovation"

        if argv.p?
            envCopy.HTTP_PROXY = argv.p

        jobExec = spawn "node", args,
            cwd: path
            shell: true
            # env: envCopy

        jobExec.stdout.on "data", (data)=>
            if data? then fullOutput += data.toString()

        jobExec.stderr.on "data", (data)=>
            if data? then fullOutput += "[Err] " + data.toString()

        jobExec.on "close", (code)=>
            console.log "CLOSED:", fullOutput
            processOutput(fullOutput)

catch e

    config.reportError "Spawn issue:", e
