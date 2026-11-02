package com.audeat.owner;

import com.audeat.security.CurrentUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Owner endpoints (owner role only, {@code SecurityConfig}). None takes a store id: the store is
 * always the signed-in owner's, so an owner cannot name another store (AC 9.2, 15.2).
 */
@RestController
@RequestMapping("/api/my-store")
public class MyStoreController {

  private final OwnerService owner;
  private final CurrentUser currentUser;

  public MyStoreController(OwnerService owner, CurrentUser currentUser) {
    this.owner = owner;
    this.currentUser = currentUser;
  }

  @GetMapping
  public MyStoreResponse myStore(@AuthenticationPrincipal Jwt jwt) {
    return owner.myStore(currentUser.ownerStoreId(jwt));
  }
}
