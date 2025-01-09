package com.example.demo.config;

import org.springframework.batch.core.launch.JobLauncher;
import org.springframework.batch.core.launch.support.RunIdIncrementer;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.batch.core.step.tasklet.Tasklet;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.batch.core.Job;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.JobExecutionListener;
import com.example.demo.listener.FileDownloadJobListener;

@Configuration
public class SampleBatchConfig {
  private final JobLauncher jobLauncher;
  private final JobRepository jobRepository;
  private final PlatformTransactionManager transactionManager;

  @Autowired
  @Qualifier("FileDownloadTasklet")
  private Tasklet FileDownloadTasklet;

  public SampleBatchConfig(JobLauncher jobLauncher, JobRepository jobRepository, PlatformTransactionManager transactionManager) {
    this.jobLauncher = jobLauncher;
    this.jobRepository = jobRepository;
    this.transactionManager = transactionManager;
  }

  @Bean
  public JobExecutionListener FileDownloadJobListener() {
    return new FileDownloadJobListener();
  }

  @Bean
  public Step FileDownloadStep() {
    return new StepBuilder("fileDownloadStep", jobRepository)
        .tasklet(FileDownloadTasklet, transactionManager)
        .build();
  }

  @Bean
  public Job fileDownloadJob() {
    return new JobBuilder("fileDownloadJob", jobRepository)
        .incrementer(new RunIdIncrementer())
        .start(FileDownloadStep())
        .build();
  }

}