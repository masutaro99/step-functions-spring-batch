package com.example.demo.listener;

import org.springframework.batch.core.JobExecution;
import org.springframework.batch.core.JobExecutionListener;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class FileDownloadJobListener implements JobExecutionListener {
  
  @Override
  public void beforeJob(JobExecution jobExecution) {
    log.info("Job started at: " + jobExecution.getStartTime());
  }

  @Override
  public void afterJob(JobExecution jobExecution) {
    log.info("Job ended at: " + jobExecution.getEndTime());
  }

}
