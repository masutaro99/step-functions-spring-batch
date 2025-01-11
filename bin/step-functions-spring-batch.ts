#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { EcrRepositoryStack } from "../lib/ecr-repository-stack";
import { StepFunctionsSpringBatchStack } from "../lib/step-functions-spring-batch-stack";

const app = new cdk.App();
new EcrRepositoryStack(app, "EcrRepositoryStack", {
  repositoryName: "spring-batch-sample-app",
});
new StepFunctionsSpringBatchStack(app, "StepFunctionsSpringBatchStack", {
  repositoryName: "spring-batch-sample-app",
  imageTag: "3081346", // Specify the image tag of the Docker image to use
  batchSchedule: "cron(0 23 * * ? *)", // JST
  maxRetryCount: 3,
  // notificationEmail: [""],
});
