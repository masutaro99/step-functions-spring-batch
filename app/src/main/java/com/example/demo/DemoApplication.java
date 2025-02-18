package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {

	public static void main(String[] args) {
		int exitCode = SpringApplication.exit(SpringApplication.run(DemoApplication.class, args));
		System.exit(exitCode);
	}

}
