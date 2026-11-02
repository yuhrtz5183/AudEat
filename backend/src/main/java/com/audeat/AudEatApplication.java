package com.audeat;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
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

  /** Deadlines and overdue use today's date in this zone, not the server's (UTC on Azure). */
  @Bean
  Clock clock(@Value("${audeat.time-zone:America/Chicago}") String timeZone) {
    return Clock.system(ZoneId.of(timeZone));
  }
}
