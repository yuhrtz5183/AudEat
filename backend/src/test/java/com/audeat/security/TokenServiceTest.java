package com.audeat.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.audeat.store.Store;
import com.audeat.user.Role;
import com.audeat.user.UserAccount;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;

class TokenServiceTest {

  private static final AudEatProperties PROPERTIES =
      new AudEatProperties(
          new AudEatProperties.Jwt("unit-test-secret-that-is-32-bytes-or-more", Duration.ofHours(2)),
          new AudEatProperties.Cors(List.of()));

  private final SecurityConfig config = new SecurityConfig();
  private final SecretKey key = config.jwtSigningKey(PROPERTIES);

  @Test
  @DisplayName("issues a token carrying the user id, role, issuer and expiry")
  void issuesTokenWithClaims() {
    Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    TokenService tokens =
        new TokenService(config.jwtEncoder(key), PROPERTIES, Clock.fixed(now, ZoneOffset.UTC));
    UserAccount owner =
        new UserAccount("Sam", "sam@example.com", "hash", Role.OWNER, new Store("S", "A"), now);
    ReflectionTestUtils.setField(owner, "id", 42L);

    Jwt jwt = config.jwtDecoder(key).decode(tokens.issue(owner));

    assertThat(jwt.getSubject()).isEqualTo("42");
    assertThat(jwt.getClaimAsString("role")).isEqualTo("owner");
    assertThat(jwt.getClaimAsString("iss")).isEqualTo("audeat");
    assertThat(jwt.getIssuedAt()).isEqualTo(now);
    assertThat(jwt.getExpiresAt()).isEqualTo(now.plus(Duration.ofHours(2)));
  }

  @Test
  @DisplayName("refuses to start with a signing secret shorter than 32 bytes")
  void rejectsShortSecret() {
    AudEatProperties weak =
        new AudEatProperties(
            new AudEatProperties.Jwt("too-short", Duration.ofHours(1)),
            new AudEatProperties.Cors(List.of()));

    assertThatThrownBy(() -> config.jwtSigningKey(weak))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("AUDEAT_JWT_SECRET");
  }
}
