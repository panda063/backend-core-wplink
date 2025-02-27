#!/bin/bash

# Reload Server
cd /home/ec2-user/passionbits/backend-core

if [ "$DEPLOYMENT_GROUP_NAME" == "gh-production" ]
then
    sudo pm2 reload core
else
    sudo pm2 reload core
fi