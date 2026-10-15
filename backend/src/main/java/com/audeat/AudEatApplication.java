package com.audeat;

import java.time.Clock;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Bean;

/** Entry point for the AudEat REST API. */
@SpringBootApplication
@ConfigurationPropertiesScan
public class AudEatApplication {

  public static void main(String[] args) {
    SpringApplication.run(AudEatApplication.class, args);
  }

  @Bean
  Clock clock() {
    return Clock.systemUTC();
  }
}
