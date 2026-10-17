package com.audeat.auth;

import com.audeat.auth.AuthExceptions.EmailAlreadyRegistered;
import com.audeat.auth.AuthExceptions.InvalidCredentials;
import com.audeat.auth.AuthExceptions.InvalidFields;
import com.audeat.auth.AuthExceptions.UnknownUser;
import com.audeat.security.TokenService;
import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import com.audeat.user.Role;
import com.audeat.user.UserAccount;
import com.audeat.user.UserAccountRepository;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Account registration (US 12) and login (US 13). */
@Service
public class AuthService {

  /** Same rule as the frontend's validate.js. */
  static final String EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

  /** BCrypt only reads the first 72 bytes of a password. */
  private static final int MAX_PASSWORD_BYTES = 72;

  private final UserAccountRepository users;
  private final StoreRepository stores;
  private final PasswordEncoder passwordEncoder;
  private final TokenService tokens;
  private final Clock clock;
  private final String unknownUserHash;

  public AuthService(
      UserAccountRepository users,
      StoreRepository stores,
      PasswordEncoder passwordEncoder,
      TokenService tokens,
      Clock clock) {
    this.users = users;
    this.stores = stores;
    this.passwordEncoder = passwordEncoder;
    this.tokens = tokens;
    this.clock = clock;
    // Compared against when the email is unknown, so both failure paths take as long.
    this.unknownUserHash = passwordEncoder.encode("audeat-unknown-user");
  }

  /** Creates an inspector, or a store owner tied to an existing store. */
  @Transactional
  public UserResponse register(RegisterRequest request) {
    Role role = Role.fromValue(request.role()).orElseThrow();
    String email = normalizeEmail(request.email());
    Map<String, String> errors = new LinkedHashMap<>();

    if (request.password().getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
      errors.put("password", "Use a shorter password.");
    }
    Optional<Store> store = Optional.empty();
    if (role == Role.OWNER) {
      store = Optional.ofNullable(request.storeId()).flatMap(stores::findById);
      if (store.isEmpty()) {
        errors.put("storeId", "Choose your store.");
      }
    }
    if (!errors.isEmpty()) {
      throw new InvalidFields(errors);
    }
    if (users.existsByEmail(email)) {
      throw new EmailAlreadyRegistered();
    }

    UserAccount user =
        new UserAccount(
            request.name().trim(),
            email,
            passwordEncoder.encode(request.password()),
            role,
            store.orElse(null),
            clock.instant());
    try {
      users.saveAndFlush(user);
    } catch (DataIntegrityViolationException e) {
      // Another request registered the same email between the check and the insert.
      throw new EmailAlreadyRegistered();
    }
    return UserResponse.from(user);
  }

  /** Checks credentials and returns a token. Every failure is the same {@link InvalidCredentials}. */
  @Transactional(readOnly = true)
  public LoginResponse login(LoginRequest request) {
    Optional<UserAccount> user = users.findByEmail(normalizeEmail(request.email()));
    String hash = user.map(UserAccount::getPasswordHash).orElse(unknownUserHash);
    boolean matches = passwordEncoder.matches(request.password(), hash);
    if (user.isEmpty() || !matches) {
      throw new InvalidCredentials();
    }
    return new LoginResponse(tokens.issue(user.get()), UserResponse.from(user.get()));
  }

  /** Returns the user a valid token was issued to. */
  @Transactional(readOnly = true)
  public UserResponse currentUser(long userId) {
    return users.findById(userId).map(UserResponse::from).orElseThrow(UnknownUser::new);
  }

  private static String normalizeEmail(String email) {
    return email.trim().toLowerCase(Locale.ROOT);
  }
}
