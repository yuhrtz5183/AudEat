package com.audeat.security;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Settings under {@code audeat.*}. */
@ConfigurationProperties("audeat")
public record AudEatProperties(Jwt jwt, Cors cors) {

  /**
   * Token signing settings.
   *
   * @param secret HMAC-SHA256 key, at least 32 bytes
   * @param ttl how long an issued token stays valid
   */
  public record Jwt(String secret, Duration ttl) {}

  /** @param allowedOrigins frontend origins allowed to call the API, e.g. the Vercel URL */
  public record Cors(List<String> allowedOrigins) {}
}
