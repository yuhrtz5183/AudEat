package com.audeat.security;

import com.audeat.auth.AuthExceptions.UnknownUser;
import com.audeat.user.UserAccount;
import com.audeat.user.UserAccountRepository;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** The account behind a request's bearer token. */
@Component
public class CurrentUser {

  private final UserAccountRepository users;

  public CurrentUser(UserAccountRepository users) {
    this.users = users;
  }

  /** The token's user; 401 when the account no longer exists. */
  @Transactional(readOnly = true)
  public UserAccount require(Jwt jwt) {
    return users.findById(Long.parseLong(jwt.getSubject())).orElseThrow(UnknownUser::new);
  }

  /** The owner's store, the only one owner endpoints read ({@code users_store_check}). */
  @Transactional(readOnly = true)
  public long ownerStoreId(Jwt jwt) {
    return require(jwt).getStore().getId();
  }
}
