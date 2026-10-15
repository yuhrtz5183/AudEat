package com.audeat.security;

import com.audeat.user.UserAccount;
import java.time.Clock;
import java.time.Instant;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/** Issues the signed access tokens returned by login. */
@Service
public class TokenService {

  static final String ISSUER = "audeat";
  static final String ROLE_CLAIM = "role";

  private final JwtEncoder encoder;
  private final AudEatProperties properties;
  private final Clock clock;

  public TokenService(JwtEncoder encoder, AudEatProperties properties, Clock clock) {
    this.encoder = encoder;
    this.properties = properties;
    this.clock = clock;
  }

  /** Returns a token whose subject is the user id and whose {@code role} claim is the role. */
  public String issue(UserAccount user) {
    Instant now = clock.instant();
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .issuer(ISSUER)
            .issuedAt(now)
            .expiresAt(now.plus(properties.jwt().ttl()))
            .subject(String.valueOf(user.getId()))
            .claim(ROLE_CLAIM, user.getRole().value())
            .build();
    JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
    return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
  }
}
