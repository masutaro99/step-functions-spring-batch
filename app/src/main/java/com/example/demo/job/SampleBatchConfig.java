package com.example.demo.job;
import org.springframework.batch.core.Job;
import org.springframework.batch.core.Step;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.batch.repeat.RepeatStatus;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
public class SampleBatchConfig {
  @Bean
  Job sampleJob(JobRepository jobRepository, PlatformTransactionManager txManager) {
    Step step = new StepBuilder("sampleStep", jobRepository)
        .allowStartIfComplete(true)
        .tasklet((contribution, chunkContext) -> {
          System.out.println("sample job step");
          return RepeatStatus.FINISHED;
        }, txManager)
          .build();
    return new JobBuilder("sampleJob", jobRepository)
        .start(step)
          .build();
  }
}