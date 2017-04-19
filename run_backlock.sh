#!/bin/sh

echo 'Starting day 2'

coffee run_update.coffee -n NorthCarolina -o 2 -d 2 -p 'http://173.234.249.106:8800'
coffee run_update.coffee -n SouthCarolina -o 2 -d 2 -p 'http://173.208.46.242:8800'

echo 'Done with day 2'
sleep 3

echo 'Starting day 4'

coffee run_update.coffee -n NorthCarolina -o 4 -d 2 -p 'http://173.234.181.148:8800'
coffee run_update.coffee -n SouthCarolina -o 4 -d 2 -p 'http://173.234.165.9:8800'

