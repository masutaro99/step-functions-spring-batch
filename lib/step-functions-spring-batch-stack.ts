import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as sfn_tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as lambda from "aws-cdk-lib/aws-lambda";

export interface StepFunctionsSpringBatchStackProps extends cdk.StackProps {
  repositoryName: string;
  imageTag: string;
  batchSchedule: string;
  maxRetryCount?: number;
  notificationEmail?: string[];
}

export class StepFunctionsSpringBatchStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StepFunctionsSpringBatchStackProps
  ) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    // SNS Topic
    const snsTopic = new sns.Topic(this, "SnsTopic", {});
    props.notificationEmail?.forEach((email) => {
      snsTopic.addSubscription(new subscriptions.EmailSubscription(email));
    });

    // S3 Bucket for Batch Job
    const s3Bucket = new s3.Bucket(this, "BatchJobBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Secret for DB credentials
    const dbSecret = new secretsmanager.Secret(this, "AuroraSecret", {
      secretName: `aurora-root-secret`,
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: "password",
        secretStringTemplate: JSON.stringify({
          username: "postgres",
        }),
      },
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc: vpc,
      containerInsights: true,
    });

    // ECS Task Execution Role
    const taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    // ECS Task Role
    const taskRole = new iam.Role(this, "EcsTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
      ],
    });

    // ECS Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      {
        memoryLimitMiB: 1024,
        cpu: 512,
        taskRole: taskRole,
        executionRole: taskExecutionRole,
      }
    );
    const ecsContainer = taskDefinition.addContainer("App", {
      image: ecs.ContainerImage.fromEcrRepository(
        ecr.Repository.fromRepositoryName(
          this,
          "AppRepository",
          props.repositoryName
        ),
        props.imageTag
      ),
      essential: true,
      secrets: {
        DATABASE_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
        DATABASE_HOST: ecs.Secret.fromSecretsManager(dbSecret, "host"),
        DATABASE_NAME: ecs.Secret.fromSecretsManager(dbSecret, "dbname"),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "ecs",
        logGroup: new logs.LogGroup(this, "AppLogGroup", {
          logGroupName: "/ecs/spring-batch-sample-app",
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
    });

    // Security Group for ECS Task
    const taskSg = new ec2.SecurityGroup(this, "TaskSg", {
      vpc: vpc,
      allowAllOutbound: true,
    });

    // Aurora Serverless Cluster
    const auroraCluster = new rds.DatabaseCluster(
      this,
      "AuroraServerlessCluster",
      {
        engine: cdk.aws_rds.DatabaseClusterEngine.auroraPostgres({
          version: cdk.aws_rds.AuroraPostgresEngineVersion.VER_16_4,
        }),
        defaultDatabaseName: "postgres",
        credentials: rds.Credentials.fromSecret(dbSecret),
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        writer: rds.ClusterInstance.serverlessV2("WriterInstance", {
          publiclyAccessible: false,
        }),
        vpc: vpc,
        vpcSubnets: vpc.selectSubnets({
          subnetGroupName: "Private",
        }),
        serverlessV2MaxCapacity: 1.0,
        serverlessV2MinCapacity: 1.0,
        cloudwatchLogsExports: ["postgresql"],
        cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
        storageEncrypted: true,
      }
    );
    auroraCluster.connections.allowFrom(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432)
    );

    // Lambda Function for Error Handling
    const errorHandlerFunction = new lambda.Function(
      this,
      `ErrorHandlerFunction`,
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "index.handler",
        code: lambda.Code.fromAsset("lib/lambda/error_handler"),
      }
    );

    // Error Handling Task
    const errorHandler = new sfn_tasks.LambdaInvoke(this, "ErrorHandlingTask", {
      lambdaFunction: errorHandlerFunction,
      inputPath: "$",
    });

    // Notification for Job Success
    const notifySuccess = new sfn_tasks.SnsPublish(this, "NotifySuccess", {
      topic: snsTopic,
      subject: "Task successfully proceessed.",
      message: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: "$.Notify",
    });

    // Notification for Job Failure
    const notifyFailure = new sfn_tasks.SnsPublish(this, "NotifyFailure", {
      topic: snsTopic,
      subject: "Task failed",
      message: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: "$.Notify",
    });

    // ECS Run Task
    const runTask = new sfn_tasks.EcsRunTask(this, "RunTask", {
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      cluster,
      taskDefinition,
      launchTarget: new sfn_tasks.EcsFargateLaunchTarget(),
      assignPublicIp: false,
      resultPath: "$.RunTask",
      containerOverrides: [
        {
          containerDefinition: ecsContainer,
          command: ["--spring.batch.job.name=fileDownloadJob"],
          environment: [
            {
              name: "BUCKET_NAME",
              value: s3Bucket.bucketName,
            },
            {
              name: "FILE_KEY",
              value: "test.txt",
            },
          ],
        },
      ],
      securityGroups: [taskSg],
    });

    // Step Functions State Machine
    const definitionBody = sfn.DefinitionBody.fromChainable(
      runTask
        .addCatch(
          errorHandler.next(
            new sfn.Choice(this, "Retryable?")
              .when(
                sfn.Condition.and(
                  sfn.Condition.stringEquals("$.Payload.type", "retryable"),
                  sfn.Condition.numberLessThan(
                    "$.Payload.retryCount",
                    props.maxRetryCount ?? 5
                  )
                ),
                new sfn.Wait(this, "RetryWait", {
                  time: sfn.WaitTime.secondsPath("$.Payload.waitTimeSeconds"),
                }).next(runTask)
              )
              .otherwise(notifyFailure)
          ),
          { resultPath: "$.RunTaskError" }
        )
        .next(notifySuccess)
    );
    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definitionBody: definitionBody,
    });

    // EventBridge Scheduler Role
    const eventSchedulerRole = new iam.Role(this, "EventSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    eventSchedulerRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [stateMachine.stateMachineArn],
        actions: ["states:StartExecution"],
      })
    );

    // EventBridge Scheduler
    new scheduler.CfnSchedule(this, `execStepFunctionsSchedule`, {
      scheduleExpression: props.batchSchedule,
      scheduleExpressionTimezone: "Asia/Tokyo",
      flexibleTimeWindow: { mode: "OFF" },
      state: "ENABLED",
      target: {
        arn: stateMachine.stateMachineArn,
        roleArn: eventSchedulerRole.roleArn,
      },
      groupName: "default",
    });
  }
}
