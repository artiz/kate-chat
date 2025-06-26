#!/bin/bash

aws ecs update-service --cluster katechat-staging-cluster --service katechat-staging-frontend-service --force-new-deployment --region eu-central-1
aws ecs update-service --cluster katechat-staging-cluster --service katechat-staging-backend-service --force-new-deployment --region eu-central-1
