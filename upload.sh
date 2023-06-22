#!/bin/bash

set -x
set -eo pipefail

aws --region=ap-northeast-1 lambda update-function-code \
    --function-name room-cleaning-bureaucrat \
    --zip-file fileb://lambda.zip