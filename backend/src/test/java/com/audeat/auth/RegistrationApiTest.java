package com.audeat.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import com.audeat.user.Role;
import com.audeat.user.UserAccount;
import com.audeat.user.UserAccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** US 12 Create an Account: {@code POST /api/auth/register}. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RegistrationApiTest {

  @Autowired private MockMvc mvc;
  @Autowired private UserAccountRepository users;
  @Autowired private StoreRepository stores;
  @Autowired private PasswordEncoder passwordEncoder;

  @BeforeEach
  void clearUsers() {
    users.deleteAll();
  }

  @Test
  @DisplayName("AC 12.1: registers an inspector with the selected role and a hashed password")
  void registersInspector() throws Exception {
    register(
            """
            {"name": " Ada Inspector ", "email": "Ada@Example.com", "password": "correct-horse",
             "role": "inspector", "storeId": null}
            """)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNumber())
        .andExpect(jsonPath("$.name").value("Ada Inspector"))
        .andExpect(jsonPath("$.email").value("ada@example.com"))
        .andExpect(jsonPath("$.role").value("inspector"))
        .andExpect(jsonPath("$.storeId").value(nullValue()))
        .andExpect(jsonPath("$.password").doesNotExist())
        .andExpect(jsonPath("$.passwordHash").doesNotExist());

    UserAccount saved = users.findByEmail("ada@example.com").orElseThrow();
    assertThat(saved.getRole()).isEqualTo(Role.INSPECTOR);
    assertThat(saved.getPasswordHash()).isNotEqualTo("correct-horse");
    assertThat(passwordEncoder.matches("correct-horse", saved.getPasswordHash())).isTrue();
  }

  @Test
  @DisplayName("AC 12.1: registers a store owner against the store selected from the list")
  void registersOwnerWithStore() throws Exception {
    Store harbor = store("Harbor Noodle House");

    // The frontend sends the id from a <select>, so it arrives as a string.
    register(
            """
            {"name": "Sam Owner", "email": "sam@example.com", "password": "tasty-noodles",
             "role": "owner", "storeId": "%d"}
            """
                .formatted(harbor.getId()))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.role").value("owner"))
        .andExpect(jsonPath("$.storeId").value(harbor.getId()))
        .andExpect(jsonPath("$.storeName").value("Harbor Noodle House"));

    assertThat(users.findByEmail("sam@example.com").orElseThrow().getRole()).isEqualTo(Role.OWNER);
  }

  @Test
  @DisplayName("AC 12.1: an inspector is never tied to a store")
  void ignoresStoreForInspector() throws Exception {
    register(inspector("ada@example.com").replace("\"storeId\": null", "\"storeId\": 1"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.storeId").value(nullValue()));
  }

  @Test
  @DisplayName("AC 12.2: rejects an email that is already registered, ignoring case")
  void rejectsDuplicateEmail() throws Exception {
    register(inspector("ada@example.com")).andExpect(status().isCreated());

    register(inspector("ADA@EXAMPLE.COM"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.message").value("This email is already registered."));

    assertThat(users.count()).isEqualTo(1);
  }

  @Test
  @DisplayName("AC 12.3: reports every missing field and creates nothing")
  void rejectsMissingFields() throws Exception {
    register("{}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.name").value("Enter your full name."))
        .andExpect(jsonPath("$.errors.email").value("Enter your email."))
        .andExpect(jsonPath("$.errors.password").value("Enter your password."))
        .andExpect(jsonPath("$.errors.role").value("Choose inspector or store owner."));

    assertThat(users.count()).isZero();
  }

  @Test
  @DisplayName("AC 12.3: a blank email reports the missing value, not the format")
  void blankEmailReportsMissing() throws Exception {
    register(inspector(""))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.email").value("Enter your email."));
  }

  @Test
  @DisplayName("AC 12.3: rejects a bad email, a short password and an unknown role")
  void rejectsInvalidValues() throws Exception {
    register(
            """
            {"name": "Ada", "email": "ada@example", "password": "seven77", "role": "admin"}
            """)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.email").value("Enter a valid email address."))
        .andExpect(jsonPath("$.errors.password").value("Use at least 8 characters."))
        .andExpect(jsonPath("$.errors.role").value("Choose inspector or store owner."));

    assertThat(users.count()).isZero();
  }

  @Test
  @DisplayName("AC 12.3: accepts a password of exactly 8 characters")
  void acceptsEightCharacterPassword() throws Exception {
    register(inspector("ada@example.com").replace("correct-horse", "eight888"))
        .andExpect(status().isCreated());
  }

  @Test
  @DisplayName("AC 12.3: requires a store owner to choose an existing store")
  void requiresStoreForOwner() throws Exception {
    String owner =
        """
        {"name": "Sam Owner", "email": "sam@example.com", "password": "tasty-noodles",
         "role": "owner", "storeId": %s}
        """;

    register(owner.formatted("null"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.storeId").value("Choose your store."));
    register(owner.formatted("999999"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.storeId").value("Choose your store."));

    assertThat(users.count()).isZero();
  }

  @Test
  @DisplayName("rejects a password longer than BCrypt can hash")
  void rejectsOverlongPassword() throws Exception {
    register(inspector("ada@example.com").replace("correct-horse", "é".repeat(40)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.password").value("Use a shorter password."));
  }

  @Test
  @DisplayName("rejects a malformed request body")
  void rejectsMalformedJson() throws Exception {
    register("{\"name\": ")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.message").value("Request body is missing or malformed."));
  }

  private ResultActions register(String json) throws Exception {
    return mvc.perform(
        post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json));
  }

  private Store store(String name) {
    return stores.findAll().stream()
        .filter(store -> store.getName().equals(name))
        .findFirst()
        .orElseThrow();
  }

  private static String inspector(String email) {
    return """
        {"name": "Ada Inspector", "email": "%s", "password": "correct-horse",
         "role": "inspector", "storeId": null}
        """
        .formatted(email);
  }
}
