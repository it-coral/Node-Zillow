#!/usr/bin/env /usr/local/bin/coffee

jsonfile   = require 'jsonfile'
newPromise = require 'newpromise'
config     = require 'edgecommonconfig'
{quote}    = require 'shell-quote'
{parse}    = require 'shell-quote'
EdgeApi    = require 'edgeapi'

##|  Import the current package.json to find the repo details
pkg  = jsonfile.readFileSync "package.json"

if !pkg.repository? or !pkg.repository.url?
    console.log "Error:  Missing repository url in package.json file"
    process.exit()

##|
##|  Auto determine NPM URL
repo = pkg.repository.url
npm  = "git+ssh://#{repo}"

##|
##|  Auto determine NPM FOlder
folder = "node_modules/#{pkg.name}"

all  = ["NorthCarolina", "SouthCarolina", "Florida1", "Florida2", "Florida3", "Florida4", "Texas", "Georgia"]

for loc in all

    ##|
    ##| -------------------------------------- Register the job --------------------------------------
    ##

    job             =
        title           : "Crime import for #{loc}"
        freqType        : "hourly"
        freqRate        : 24
        workingFolder   : folder
        scriptName      : "run_update.coffee"
        commandLineArgs : quote(["-n", loc])
        owner           : "System"
        npm             : npm

    config.dump "Submitting job details", job
    newPromise ()=>

        api    = yield EdgeApi.doGetApi()
        result = yield api.os_doCreateJob job.title, job.freqType, job.freqRate, job.workingFolder, job.scriptName, job.commandLineArgs, job.owner, npm
        config.dump "Job created: #{job.title}, result", result

    .then ()=>

        process.exit()