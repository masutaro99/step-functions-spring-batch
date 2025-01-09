package com.example.demo.tasklet;

import org.springframework.batch.repeat.RepeatStatus;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.batch.core.step.tasklet.Tasklet;
import org.springframework.stereotype.Component;
import org.springframework.batch.core.StepContribution;
import org.springframework.batch.core.scope.context.ChunkContext;
import org.springframework.batch.core.StepExecution;
import org.springframework.batch.core.BatchStatus;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import lombok.extern.slf4j.Slf4j;

@Component("FileDownloadTasklet")
@StepScope
@Slf4j
public class FileDownloadTasklet implements Tasklet {

  @Override
  public RepeatStatus execute(StepContribution contribution, ChunkContext chunkContext) throws Exception {
    StepExecution stepExecution = chunkContext.getStepContext().getStepExecution();
    S3Client s3Client = S3Client.builder()
        .region(Region.AP_NORTHEAST_1)
        .build();
    String bucketName = System.getenv("BUCKET_NAME");
    String fileKey = System.getenv("FILE_KEY");
    try {
      GetObjectRequest getObjectRequest = GetObjectRequest.builder()
          .bucket(bucketName)
          .key(fileKey)
          .build();
      s3Client.getObject(getObjectRequest);
    } catch (S3Exception e) {
       log.error(e.awsErrorDetails().errorMessage());
      if (e.awsErrorDetails().errorCode().equals("NoSuchKey")) {
        log.error("NoSuchKey");
        stepExecution.setStatus(BatchStatus.ABANDONED);
      } else {
        stepExecution.setStatus(BatchStatus.FAILED);
      }
    }

    return RepeatStatus.FINISHED;
  }

}
