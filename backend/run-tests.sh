#!/usr/bin/env bash
source /home/brexc/.nvm/nvm.sh
cd /home/brexc/projects/taskflow/backend
node node_modules/.bin/jest --testTimeout=15000 --forceExit --runInBand --verbose 2>&1
