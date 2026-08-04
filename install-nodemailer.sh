#!/bin/bash
export PATH="/home/brexc/.nvm/versions/node/v24.18.1/bin:$PATH"
echo "node: $(node --version)"
echo "npm: $(npm --version)"
cd /home/brexc/projects/taskflow/backend
npm install nodemailer@6.10.1
echo "EXIT: $?"
