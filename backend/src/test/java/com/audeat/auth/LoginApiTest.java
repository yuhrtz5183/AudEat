package com.audeat.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.store.StoreRepository;
import com.audeat.user.UserAccountRepository;
import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** US 13 Log In: {@code POST /api/auth/login} and token-protected endpoints. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LoginApiTest {

  private static final String INVALID = "Invalid email or password.";

  @Autowired private MockMvc mvc;
  @Autowired private UserAccountRepository users;
  @Autowired private StoreRepository stores;
  @Autowired private JwtEncoder jwtEncoder;

  @BeforeEach
  void registerUsers() throws Exception {
    users.deleteAll();
    long harbor =
        stores.findAll().stream()
            .filter(store -> store.getName().equals("Harbor Noodle House"))
            .findFirst()
            .orElseThrow()
            .getId();
    register("Ada Inspector", "ada@example.com", "correct-horse", "inspector", null);
    register("Sam Owner", "sam@example.com", "tasty-noodles", "owner", harbor);
  }

  @Test
  @DisplayName("AC 13.1: logs an inspector in and returns a token and the inspector role")
  void logsInInspector() throws Exception {
    String token =
        token(
            login("ada@example.com", "correct-horse")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.user.email").value("ada@example.com"))
                .andExpect(jsonPath("$.user.role").value("inspector"))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist()));

    mvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Ada Inspector"))
        .andExpect(jsonPath("$.role").value("inspector"));
  }

  @Test
  @DisplayName("AC 13.1: logs a store owner in with their store")
  void logsInOwner() throws Exception {
    login("sam@example.com", "tasty-noodles")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.user.role").value("owner"))
        .andExpect(jsonPath("$.user.storeName").value("Harbor Noodle House"));
  }

  @Test
  @DisplayName("AC 13.1: matches the email regardless of case and surrounding spaces")
  void emailIsCaseInsensitive() throws Exception {
    login("  ADA@Example.com ", "correct-horse").andExpect(status().isOk());
  }

  @Test
  @DisplayName("AC 13.2: rejects a wrong password with a generic message")
  void rejectsWrongPassword() throws Exception {
    login("ada@example.com", "wrong-password")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.message").value(INVALID))
        .andExpect(jsonPath("$.token").doesNotExist());
  }

  @Test
  @DisplayName("AC 13.2 + 13.4: an unregistered email gets exactly the wrong-password response")
  void unregisteredEmailMatchesWrongPassword() throws Exception {
    String wrongPassword = body(login("ada@example.com", "wrong-password"));
    String unregistered =
        body(login("nobody@example.com", "whatever-1").andExpect(status().isUnauthorized()));

    assertThat(unregistered).isEqualTo(wrongPassword);
  }

  @Test
  @DisplayName("AC 13.2: a password too long to hash is still just invalid")
  void overlongPasswordIsInvalid() throws Exception {
    login("ada@example.com", "x".repeat(100))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.message").value(INVALID));
  }

  @Test
  @DisplayName("rejects a login with missing fields")
  void rejectsMissingFields() throws Exception {
    mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.email").value("Enter your email."))
        .andExpect(jsonPath("$.errors.password").value("Enter your password."));
  }

  @Test
  @DisplayName("AC 13.3: protected endpoints require a token")
  void protectedEndpointsRequireToken() throws Exception {
    mvc.perform(get("/api/auth/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.message").value("Authentication required."));
    mvc.perform(get("/api/inspections")).andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("AC 13.3: rejects malformed, forged and expired tokens")
  void rejectsBadTokens() throws Exception {
    Instant now = Instant.now();
    JwtEncoder forger =
        NimbusJwtEncoder.withSecretKey(
                new SecretKeySpec(
                    "some-other-secret-at-least-32-bytes!!".getBytes(StandardCharsets.UTF_8),
                    "HmacSHA256"))
            .build();

    String forged = encode(forger, now, now.plus(1, ChronoUnit.HOURS));
    String expired = encode(jwtEncoder, now.minus(2, ChronoUnit.HOURS), now.minus(1, ChronoUnit.HOURS));

    for (String token : new String[] {"not-a-jwt", forged, expired}) {
      mvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
          .andExpect(status().isUnauthorized());
    }
  }

  @Test
  @DisplayName("AC 13.3: a token for a deleted account is no longer accepted")
  void rejectsTokenForDeletedUser() throws Exception {
    String token = token(login("ada@example.com", "correct-horse"));
    users.deleteAll();

    mvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
        .andExpect(status().isUnauthorized());
  }

  @Test
  @DisplayName("allows the configured frontend origin and refuses others (CORS)")
  void appliesCorsPolicy() throws Exception {
    mvc.perform(preflight("http://localhost:5173"))
        .andExpect(status().isOk())
        .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"));
    mvc.perform(preflight("https://evil.example")).andExpect(status().isForbidden());
  }

  private void register(String name, String email, String password, String role, Long storeId)
      throws Exception {
    mvc.perform(
            post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {"name": "%s", "email": "%s", "password": "%s", "role": "%s", "storeId": %s}
                    """
                        .formatted(name, email, password, role, storeId)))
        .andExpect(status().isCreated());
  }

  private ResultActions login(String email, String password) throws Exception {
    return mvc.perform(
        post("/api/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\": \"%s\", \"password\": \"%s\"}".formatted(email, password)));
  }

  private static String body(ResultActions result) throws Exception {
    return result.andReturn().getResponse().getContentAsString();
  }

  private static String token(ResultActions result) throws Exception {
    return JsonPath.read(body(result), "$.token");
  }

  private String encode(JwtEncoder encoder, Instant issuedAt, Instant expiresAt) {
    long userId = users.findByEmail("ada@example.com").orElseThrow().getId();
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .issuer("audeat")
            .issuedAt(issuedAt)
            .expiresAt(expiresAt)
            .subject(String.valueOf(userId))
            .claim("role", "inspector")
            .build();
    return encoder
        .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
        .getTokenValue();
  }

  private static org.springframework.test.web.servlet.RequestBuilder preflight(String origin) {
    return options("/api/auth/login")
        .header(HttpHeaders.ORIGIN, origin)
        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST");
  }
}
