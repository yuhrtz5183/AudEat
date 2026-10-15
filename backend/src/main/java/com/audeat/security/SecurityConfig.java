package com.audeat.security;

import static org.springframework.security.config.Customizer.withDefaults;

import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless bearer-token security. Registration, login and the store list are public; every
 * other request needs a valid token (AC 13.3).
 */
@Configuration
public class SecurityConfig {

  private static final int MIN_SECRET_BYTES = 32;

  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    AuthenticationEntryPoint unauthorized = jsonUnauthorized();
    http.csrf(csrf -> csrf.disable())
        .cors(withDefaults())
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            requests ->
                requests
                    .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/stores")
                    .permitAll()
                    .requestMatchers("/error")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(
            oauth ->
                oauth
                    .jwt(jwt -> jwt.jwtAuthenticationConverter(roleConverter()))
                    .authenticationEntryPoint(unauthorized))
        .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(unauthorized));
    return http.build();
  }

  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  SecretKey jwtSigningKey(AudEatProperties properties) {
    String secret = properties.jwt().secret();
    byte[] bytes = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    if (bytes.length < MIN_SECRET_BYTES) {
      throw new IllegalStateException(
          "audeat.jwt.secret must be at least 32 bytes; set AUDEAT_JWT_SECRET.");
    }
    return new SecretKeySpec(bytes, "HmacSHA256");
  }

  @Bean
  JwtEncoder jwtEncoder(SecretKey jwtSigningKey) {
    return NimbusJwtEncoder.withSecretKey(jwtSigningKey).algorithm(MacAlgorithm.HS256).build();
  }

  @Bean
  JwtDecoder jwtDecoder(SecretKey jwtSigningKey) {
    NimbusJwtDecoder decoder =
        NimbusJwtDecoder.withSecretKey(jwtSigningKey).macAlgorithm(MacAlgorithm.HS256).build();
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            new JwtTimestampValidator(), new JwtIssuerValidator(TokenService.ISSUER)));
    return decoder;
  }

  @Bean
  CorsConfigurationSource corsConfigurationSource(AudEatProperties properties) {
    List<String> origins =
        properties.cors().allowedOrigins() == null
            ? List.of()
            : properties.cors().allowedOrigins().stream().filter(o -> !o.isBlank()).toList();
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(origins);
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }

  /** Exposes the token's role claim as ROLE_inspector / ROLE_owner for future role checks. */
  private static JwtAuthenticationConverter roleConverter() {
    JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
    authorities.setAuthoritiesClaimName(TokenService.ROLE_CLAIM);
    authorities.setAuthorityPrefix("ROLE_");
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(authorities);
    return converter;
  }

  private static AuthenticationEntryPoint jsonUnauthorized() {
    return (request, response, exception) -> {
      response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);
      response.getWriter().write("{\"message\":\"Authentication required.\"}");
    };
  }
}
